"""T-021 audit/ops schema: registry, lineage, write-once prediction ledger, ops tables.

Contract §7: the official `prediction` row is write-once (never UPDATE/DELETE — enforced here
with triggers, belt-and-braces with the T-022 app guard and DB-role grants); all state changes
append to `prediction_event`; grades are append-only per result_version; exactly one production
model_version per league (partial unique index).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_audit_ops"
down_revision: str | None = "0001_core_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FORBID_FN = """
CREATE OR REPLACE FUNCTION kicklens_forbid_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% on % is forbidden: table is append-only (write-once ledger, Contract 7)',
        TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
"""


def upgrade() -> None:
    op.create_table(
        "dataset_snapshot",
        sa.Column("dataset_snapshot_id", sa.Integer, primary_key=True),
        sa.Column("snapshot_hash", sa.Text, nullable=False, unique=True),
        sa.Column("manifest_uri", sa.Text, nullable=True),
        sa.Column("date_range_start", sa.Date, nullable=True),
        sa.Column("date_range_end", sa.Date, nullable=True),
        sa.Column("row_count", sa.Integer, nullable=True),
        sa.Column("created_at_utc", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "training_run",
        sa.Column("training_run_id", sa.Integer, primary_key=True),
        sa.Column(
            "dataset_snapshot_id",
            sa.Integer,
            sa.ForeignKey("dataset_snapshot.dataset_snapshot_id"),
            nullable=False,
        ),
        sa.Column("code_git_sha", sa.Text, nullable=False),
        sa.Column("seed", sa.Integer, nullable=False),
        sa.Column("lockfile_hash", sa.Text, nullable=False),
        sa.Column("params", postgresql.JSONB, nullable=True),
        sa.Column("status", sa.Text, nullable=False, server_default="running"),
        sa.Column("started_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at_utc", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "model_artifact",
        sa.Column("model_artifact_id", sa.Integer, primary_key=True),
        sa.Column(
            "training_run_id",
            sa.Integer,
            sa.ForeignKey("training_run.training_run_id"),
            nullable=False,
        ),
        sa.Column("artifact_uri", sa.Text, nullable=False),
        sa.Column("artifact_hash", sa.Text, nullable=False),
        sa.Column("created_at_utc", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "calibration_artifact",
        sa.Column("calibration_artifact_id", sa.Integer, primary_key=True),
        sa.Column(
            "training_run_id",
            sa.Integer,
            sa.ForeignKey("training_run.training_run_id"),
            nullable=False,
        ),
        sa.Column("method", sa.Text, nullable=False, server_default="temperature"),
        sa.Column("param_t", sa.Float, nullable=True),
        sa.Column("fold_provenance", postgresql.JSONB, nullable=True),
        sa.Column("artifact_uri", sa.Text, nullable=True),
        sa.Column("created_at_utc", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "model_version",
        sa.Column("model_version_id", sa.Integer, primary_key=True),
        sa.Column("league_id", sa.Integer, sa.ForeignKey("league.league_id"), nullable=False),
        sa.Column(
            "model_artifact_id",
            sa.Integer,
            sa.ForeignKey("model_artifact.model_artifact_id"),
            nullable=False,
        ),
        sa.Column(
            "calibration_artifact_id",
            sa.Integer,
            sa.ForeignKey("calibration_artifact.calibration_artifact_id"),
            nullable=True,
        ),
        sa.Column("version_label", sa.Text, nullable=False),
        sa.Column("is_production", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("promoted_at_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("league_id", "version_label", name="uq_model_version_label"),
    )
    op.create_index(
        "uq_model_version_one_production_per_league",
        "model_version",
        ["league_id"],
        unique=True,
        postgresql_where=sa.text("is_production"),
    )

    op.create_table(
        "prediction_run",
        sa.Column("prediction_run_id", sa.Integer, primary_key=True),
        sa.Column("match_id", sa.Integer, sa.ForeignKey("match.match_id"), nullable=False),
        sa.Column("cutoff_utc", sa.DateTime(timezone=True), nullable=False),
        # data lineage
        sa.Column(
            "dataset_snapshot_id",
            sa.Integer,
            sa.ForeignKey("dataset_snapshot.dataset_snapshot_id"),
            nullable=True,
        ),
        sa.Column(
            "feature_row_id",
            sa.Integer,
            sa.ForeignKey("feature_row.feature_row_id"),
            nullable=False,
        ),
        sa.Column("feature_set_version", sa.Text, nullable=False, server_default="fs-v1"),
        sa.Column("data_freshness_time_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stale_inputs", sa.Boolean, nullable=False, server_default=sa.false()),
        # model lineage
        sa.Column(
            "model_version_id",
            sa.Integer,
            sa.ForeignKey("model_version.model_version_id"),
            nullable=False,
        ),
        sa.Column("code_git_sha", sa.Text, nullable=False),
        sa.Column("seed", sa.Integer, nullable=False),
        sa.Column("lockfile_hash", sa.Text, nullable=False),
        # odds lineage (when a live market snapshot is used)
        sa.Column(
            "market_snapshot_id",
            sa.Integer,
            sa.ForeignKey("market_snapshot.market_snapshot_id"),
            nullable=True,
        ),
        sa.Column("inputs_hash", sa.Text, nullable=False),
        sa.Column("created_at_utc", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "prediction",
        sa.Column("prediction_id", sa.Integer, primary_key=True),
        sa.Column("match_id", sa.Integer, sa.ForeignKey("match.match_id"), nullable=False),
        sa.Column(
            "prediction_run_id",
            sa.Integer,
            sa.ForeignKey("prediction_run.prediction_run_id"),
            nullable=False,
        ),
        sa.Column("fixture_revision", sa.Integer, nullable=False, server_default="0"),
        sa.Column("p_home", sa.Float, nullable=False),
        sa.Column("p_draw", sa.Float, nullable=False),
        sa.Column("p_away", sa.Float, nullable=False),
        sa.Column("cutoff_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("forecast_creation_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_official", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("forecast_hash", sa.Text, nullable=False, unique=True),
        sa.Column("anchored_at_utc", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "p_home > 0 AND p_draw > 0 AND p_away > 0"
            " AND abs(p_home + p_draw + p_away - 1.0) < 1e-6",
            name="ck_prediction_probs",
        ),
    )
    op.create_index("ix_prediction_match", "prediction", ["match_id"])

    op.create_table(
        "prediction_event",
        sa.Column("prediction_event_id", sa.Integer, primary_key=True),
        sa.Column(
            "prediction_id",
            sa.Integer,
            sa.ForeignKey("prediction.prediction_id"),
            nullable=True,
        ),
        sa.Column("match_id", sa.Integer, sa.ForeignKey("match.match_id"), nullable=False),
        sa.Column("event_type", sa.Text, nullable=False),
        sa.Column("event_time_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("details", postgresql.JSONB, nullable=True),
    )
    op.create_index("ix_prediction_event_match", "prediction_event", ["match_id"])

    op.create_table(
        "prediction_grade",
        sa.Column("prediction_grade_id", sa.Integer, primary_key=True),
        sa.Column(
            "prediction_id",
            sa.Integer,
            sa.ForeignKey("prediction.prediction_id"),
            nullable=False,
        ),
        sa.Column("result_version", sa.Integer, nullable=False),
        sa.Column("log_loss", sa.Float, nullable=False),
        sa.Column("rps", sa.Float, nullable=False),
        sa.Column("brier", sa.Float, nullable=False),
        sa.Column("correct", sa.Boolean, nullable=False),
        sa.Column("graded_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "prediction_id", "result_version", name="uq_grade_prediction_result_version"
        ),
    )

    op.create_table(
        "metrics_snapshot",
        sa.Column("metrics_snapshot_id", sa.Integer, primary_key=True),
        # evidence separation (Contract / CLAUDE.md §2: dev / test / backtest / live)
        sa.Column("scope", sa.Text, nullable=False),
        sa.Column("as_of_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("created_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("scope IN ('dev','test','backtest','live')", name="ck_metrics_scope"),
    )

    op.create_table(
        "job_run",
        sa.Column("job_run_id", sa.Integer, primary_key=True),
        sa.Column("job_name", sa.Text, nullable=False),
        sa.Column("idempotency_key", sa.Text, nullable=False, unique=True),
        sa.Column("status", sa.Text, nullable=False, server_default="running"),
        sa.Column("details", postgresql.JSONB, nullable=True),
        sa.Column("started_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at_utc", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "draft_prediction",
        sa.Column("draft_prediction_id", sa.Integer, primary_key=True),
        sa.Column(
            "match_id", sa.Integer, sa.ForeignKey("match.match_id"), nullable=False, unique=True
        ),
        sa.Column(
            "model_version_id",
            sa.Integer,
            sa.ForeignKey("model_version.model_version_id"),
            nullable=True,
        ),
        sa.Column("p_home", sa.Float, nullable=False),
        sa.Column("p_draw", sa.Float, nullable=False),
        sa.Column("p_away", sa.Float, nullable=False),
        sa.Column("generated_at_utc", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "staging_rejects",
        sa.Column("staging_reject_id", sa.Integer, primary_key=True),
        sa.Column("source", sa.Text, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("raw_ref", sa.Text, nullable=True),
        sa.Column("batch_id", sa.Text, nullable=True),
        sa.Column("created_at_utc", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "anchor_merkle_root",
        sa.Column("anchor_merkle_root_id", sa.Integer, primary_key=True),
        sa.Column("day", sa.Date, nullable=False, unique=True),
        sa.Column("root", sa.Text, nullable=False),
        sa.Column("committed_at_utc", sa.DateTime(timezone=True), nullable=False),
    )

    # Write-once enforcement at the DB layer (T-022 adds the app-level guard + role grants).
    op.execute(_FORBID_FN)
    for table in ("prediction", "prediction_event"):
        op.execute(
            f"CREATE TRIGGER trg_{table}_write_once BEFORE UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION kicklens_forbid_mutation()"
        )


def downgrade() -> None:
    for table in ("prediction", "prediction_event"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_write_once ON {table}")
    op.execute("DROP FUNCTION IF EXISTS kicklens_forbid_mutation()")
    op.drop_table("anchor_merkle_root")
    op.drop_table("staging_rejects")
    op.drop_table("draft_prediction")
    op.drop_table("job_run")
    op.drop_table("metrics_snapshot")
    op.drop_table("prediction_grade")
    op.drop_index("ix_prediction_event_match", table_name="prediction_event")
    op.drop_table("prediction_event")
    op.drop_index("ix_prediction_match", table_name="prediction")
    op.drop_table("prediction")
    op.drop_table("prediction_run")
    op.drop_index("uq_model_version_one_production_per_league", table_name="model_version")
    op.drop_table("model_version")
    op.drop_table("calibration_artifact")
    op.drop_table("model_artifact")
    op.drop_table("training_run")
    op.drop_table("dataset_snapshot")
