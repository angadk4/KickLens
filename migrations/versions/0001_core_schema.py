"""T-020 core schema: league, season, team, team_alias, source_fixture, match,
elo_rating, feature_row, market_snapshot.

Identity rules (Contract §5):
- live rows: source_fixture (provider, provider_fixture_id, fixture_revision);
- historical rows: natural key (season, match_date, home, away) — partial unique;
- match identity NEVER depends on the kickoff timestamp (postponements revise, not duplicate).
All timestamps are timestamptz (UTC).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_core_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "league",
        sa.Column("league_id", sa.Integer, primary_key=True),
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("name", sa.Text, nullable=False),
    )

    op.create_table(
        "season",
        sa.Column("season_id", sa.Integer, primary_key=True),
        sa.Column("league_id", sa.Integer, sa.ForeignKey("league.league_id"), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        # US-local Decision Day (regular-season end); source of the E1/R1 playoff filter.
        sa.Column("regular_season_end", sa.Date, nullable=True),
        sa.UniqueConstraint("league_id", "year", name="uq_season_league_year"),
    )

    op.create_table(
        "team",
        sa.Column("team_id", sa.Integer, primary_key=True),
        sa.Column("canonical_name", sa.Text, nullable=False, unique=True),
        sa.Column("is_defunct", sa.Boolean, nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "team_alias",
        sa.Column("team_alias_id", sa.Integer, primary_key=True),
        sa.Column("provider", sa.Text, nullable=False),
        sa.Column("provider_key", sa.Text, nullable=False),
        sa.Column("team_id", sa.Integer, sa.ForeignKey("team.team_id"), nullable=False),
        sa.UniqueConstraint("provider", "provider_key", name="uq_team_alias_provider_key"),
    )

    op.create_table(
        "match",
        sa.Column("match_id", sa.Integer, primary_key=True),
        sa.Column("season_id", sa.Integer, sa.ForeignKey("season.season_id"), nullable=False),
        sa.Column("home_team_id", sa.Integer, sa.ForeignKey("team.team_id"), nullable=False),
        sa.Column("away_team_id", sa.Integer, sa.ForeignKey("team.team_id"), nullable=False),
        # natural-key date for historical (file) rows; NULL for live-only rows
        sa.Column("natural_key_date", sa.Date, nullable=True),
        sa.Column("kickoff_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("kickoff_approx", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("status", sa.Text, nullable=False, server_default="scheduled"),
        sa.Column("is_regular_season", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("neutral_site", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("home_goals", sa.Integer, nullable=True),
        sa.Column("away_goals", sa.Integer, nullable=True),
        sa.Column("result", sa.Text, nullable=True),
        # results are append-only; corrections bump result_version (Contract §7)
        sa.Column("result_version", sa.Integer, nullable=False, server_default="0"),
        sa.CheckConstraint("result IN ('H','D','A')", name="ck_match_result"),
        sa.CheckConstraint("home_team_id <> away_team_id", name="ck_match_distinct_teams"),
    )
    op.create_index(
        "uq_match_natural_key",
        "match",
        ["season_id", "natural_key_date", "home_team_id", "away_team_id"],
        unique=True,
        postgresql_where=sa.text("natural_key_date IS NOT NULL"),
    )
    op.create_index("ix_match_kickoff_utc", "match", ["kickoff_utc"])
    op.create_index("ix_match_season_status", "match", ["season_id", "status"])

    op.create_table(
        "source_fixture",
        sa.Column("source_fixture_id", sa.Integer, primary_key=True),
        sa.Column("provider", sa.Text, nullable=False),
        sa.Column("provider_fixture_id", sa.Text, nullable=False),
        sa.Column("fixture_revision", sa.Integer, nullable=False, server_default="0"),
        sa.Column("match_id", sa.Integer, sa.ForeignKey("match.match_id"), nullable=True),
        sa.Column("kickoff_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.Text, nullable=True),
        sa.Column("home_provider_key", sa.Text, nullable=True),
        sa.Column("away_provider_key", sa.Text, nullable=True),
        sa.Column("home_goals", sa.Integer, nullable=True),
        sa.Column("away_goals", sa.Integer, nullable=True),
        sa.Column("provider_last_updated_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_ref", sa.Text, nullable=True),
        sa.UniqueConstraint(
            "provider",
            "provider_fixture_id",
            "fixture_revision",
            name="uq_source_fixture_provider_rev",
        ),
    )
    op.create_index(
        "ix_source_fixture_provider_fixture",
        "source_fixture",
        ["provider", "provider_fixture_id"],
    )

    op.create_table(
        "elo_rating",
        sa.Column("elo_rating_id", sa.Integer, primary_key=True),
        sa.Column("team_id", sa.Integer, sa.ForeignKey("team.team_id"), nullable=False),
        # rating AFTER this match completed; NULL match = initial/seasonal baseline row
        sa.Column("match_id", sa.Integer, sa.ForeignKey("match.match_id"), nullable=True),
        sa.Column("rating", sa.Float, nullable=False),
        sa.Column("rating_date", sa.Date, nullable=False),
        sa.UniqueConstraint("team_id", "match_id", name="uq_elo_team_match"),
    )
    op.create_index("ix_elo_team_date", "elo_rating", ["team_id", "rating_date"])

    op.create_table(
        "feature_row",
        sa.Column("feature_row_id", sa.Integer, primary_key=True),
        sa.Column("match_id", sa.Integer, sa.ForeignKey("match.match_id"), nullable=False),
        sa.Column("feature_set_version", sa.Text, nullable=False, server_default="fs-v1"),
        # the T-3h cutoff this row was computed as-of (point-in-time discipline)
        sa.Column("as_of_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("computed_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("features", postgresql.JSONB, nullable=False),
        sa.Column("inputs_hash", sa.Text, nullable=False),
        sa.UniqueConstraint(
            "match_id", "feature_set_version", "as_of_utc", name="uq_feature_row_asof"
        ),
    )

    op.create_table(
        "market_snapshot",
        sa.Column("market_snapshot_id", sa.Integer, primary_key=True),
        sa.Column("match_id", sa.Integer, sa.ForeignKey("match.match_id"), nullable=False),
        sa.Column("provider", sa.Text, nullable=False),
        sa.Column("capture_time_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("odds_home", sa.Numeric(8, 3), nullable=False),
        sa.Column("odds_draw", sa.Numeric(8, 3), nullable=False),
        sa.Column("odds_away", sa.Numeric(8, 3), nullable=False),
        # True for historical closing odds (no capture timestamp of their own; capture_time
        # then records the ingest time and is_closing distinguishes the semantics)
        sa.Column("is_closing", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("raw_ref", sa.Text, nullable=True),
        sa.CheckConstraint(
            "odds_home > 1 AND odds_draw > 1 AND odds_away > 1", name="ck_market_odds_gt1"
        ),
        sa.UniqueConstraint(
            "match_id", "provider", "capture_time_utc", name="uq_market_snapshot_capture"
        ),
    )


def downgrade() -> None:
    op.drop_table("market_snapshot")
    op.drop_table("feature_row")
    op.drop_table("elo_rating")
    op.drop_table("source_fixture")
    op.drop_index("ix_match_season_status", table_name="match")
    op.drop_index("ix_match_kickoff_utc", table_name="match")
    op.drop_index("uq_match_natural_key", table_name="match")
    op.drop_table("match")
    op.drop_table("team_alias")
    op.drop_table("team")
    op.drop_table("season")
    op.drop_table("league")
