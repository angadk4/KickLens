"""T-021 integration tests: audit/ops schema constraints + write-once triggers.

Requires a local Postgres (make up) and DATABASE_URL; skipped otherwise.
"""

import json
import os
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set (integration test)")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config

    NOW = datetime(2026, 7, 5, 12, 0, tzinfo=UTC)

    def _one(conn: psycopg.Connection, sql: str, args: tuple[Any, ...] = ()) -> Any:
        row = conn.execute(sql, args).fetchone()
        assert row is not None
        return row[0]

    @pytest.fixture(scope="module")
    def db() -> Iterator[psycopg.Connection]:
        cfg = Config("alembic.ini")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        assert DATABASE_URL is not None
        with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
            yield conn
            # leave a clean, migrated schema behind
            command.downgrade(cfg, "base")
            command.upgrade(cfg, "head")

    @pytest.fixture(scope="module")
    def lineage(db: psycopg.Connection) -> dict[str, int]:
        """One full lineage chain: league→…→model_version + a match with a feature_row."""
        c = db
        league = _one(c, "INSERT INTO league (code,name) VALUES ('MLS','MLS') RETURNING league_id")
        season = _one(
            c,
            "INSERT INTO season (league_id, year) VALUES (%s, 2026) RETURNING season_id",
            (league,),
        )
        home = _one(c, "INSERT INTO team (canonical_name) VALUES ('Home FC') RETURNING team_id")
        away = _one(c, "INSERT INTO team (canonical_name) VALUES ('Away FC') RETURNING team_id")
        match = _one(
            c,
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc)"
            " VALUES (%s,%s,%s,%s) RETURNING match_id",
            (season, home, away, datetime(2026, 7, 18, 23, 30, tzinfo=UTC)),
        )
        frow = _one(
            c,
            "INSERT INTO feature_row (match_id, as_of_utc, computed_at_utc, features,"
            " inputs_hash) VALUES (%s,%s,%s,%s,'h') RETURNING feature_row_id",
            (match, NOW, NOW, json.dumps({"elo_diff": 12.5})),
        )
        snap = _one(
            c,
            "INSERT INTO dataset_snapshot (snapshot_hash, created_at_utc)"
            " VALUES ('snap-1',%s) RETURNING dataset_snapshot_id",
            (NOW,),
        )
        trun = _one(
            c,
            "INSERT INTO training_run (dataset_snapshot_id, code_git_sha, seed,"
            " lockfile_hash, started_at_utc) VALUES (%s,'abc123',42,'lock-1',%s)"
            " RETURNING training_run_id",
            (snap, NOW),
        )
        mart = _one(
            c,
            "INSERT INTO model_artifact (training_run_id, artifact_uri, artifact_hash,"
            " created_at_utc) VALUES (%s,'s3://x','mh',%s) RETURNING model_artifact_id",
            (trun, NOW),
        )
        mv = _one(
            c,
            "INSERT INTO model_version (league_id, model_artifact_id, version_label,"
            " is_production, created_at_utc) VALUES (%s,%s,'v1',true,%s)"
            " RETURNING model_version_id",
            (league, mart, NOW),
        )
        prun = _one(
            c,
            "INSERT INTO prediction_run (match_id, cutoff_utc, feature_row_id,"
            " data_freshness_time_utc, model_version_id, code_git_sha, seed, lockfile_hash,"
            " inputs_hash, created_at_utc) VALUES (%s,%s,%s,%s,%s,'abc123',42,'lock-1','ih',%s)"
            " RETURNING prediction_run_id",
            (match, NOW, frow, NOW, mv, NOW),
        )
        return {
            "league": league,
            "match": match,
            "model_artifact": mart,
            "model_version": mv,
            "prediction_run": prun,
        }

    def test_audit_tables_exist(db: psycopg.Connection) -> None:
        tables = {
            r[0]
            for r in db.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname='public'"
            ).fetchall()
        }
        assert {
            "dataset_snapshot",
            "training_run",
            "model_artifact",
            "calibration_artifact",
            "model_version",
            "prediction_run",
            "prediction",
            "prediction_event",
            "prediction_grade",
            "metrics_snapshot",
            "job_run",
            "draft_prediction",
            "staging_rejects",
            "anchor_merkle_root",
        } <= tables

    def test_one_production_model_per_league(
        db: psycopg.Connection, lineage: dict[str, int]
    ) -> None:
        with pytest.raises(psycopg.errors.UniqueViolation):
            db.execute(
                "INSERT INTO model_version (league_id, model_artifact_id, version_label,"
                " is_production, created_at_utc) VALUES (%s,%s,'v2',true,%s)",
                (lineage["league"], lineage["model_artifact"], NOW),
            )
        # non-production versions are unlimited
        db.execute(
            "INSERT INTO model_version (league_id, model_artifact_id, version_label,"
            " is_production, created_at_utc) VALUES (%s,%s,'v2',false,%s)",
            (lineage["league"], lineage["model_artifact"], NOW),
        )

    @pytest.fixture(scope="module")
    def prediction_id(db: psycopg.Connection, lineage: dict[str, int]) -> int:
        pid = _one(
            db,
            "INSERT INTO prediction (match_id, prediction_run_id, p_home, p_draw, p_away,"
            " cutoff_utc, forecast_creation_utc, forecast_hash)"
            " VALUES (%s,%s,0.5,0.25,0.25,%s,%s,'hash-1') RETURNING prediction_id",
            (lineage["match"], lineage["prediction_run"], NOW, NOW),
        )
        assert isinstance(pid, int)
        return pid

    def test_prediction_update_and_delete_forbidden(
        db: psycopg.Connection, prediction_id: int
    ) -> None:
        with pytest.raises(psycopg.errors.RaiseException, match=r"write-once|append-only"):
            db.execute(
                "UPDATE prediction SET p_home = 0.9 WHERE prediction_id = %s", (prediction_id,)
            )
        with pytest.raises(psycopg.errors.RaiseException, match=r"write-once|append-only"):
            db.execute("DELETE FROM prediction WHERE prediction_id = %s", (prediction_id,))

    def test_prediction_event_append_only(
        db: psycopg.Connection, lineage: dict[str, int], prediction_id: int
    ) -> None:
        eid = _one(
            db,
            "INSERT INTO prediction_event (prediction_id, match_id, event_type, event_time_utc)"
            " VALUES (%s,%s,'OfficialFinalized',%s) RETURNING prediction_event_id",
            (prediction_id, lineage["match"], NOW),
        )
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute(
                "UPDATE prediction_event SET event_type='Kickoff' WHERE prediction_event_id = %s",
                (eid,),
            )

    def test_prediction_probability_check(db: psycopg.Connection, lineage: dict[str, int]) -> None:
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(
                "INSERT INTO prediction (match_id, prediction_run_id, p_home, p_draw, p_away,"
                " cutoff_utc, forecast_creation_utc, forecast_hash)"
                " VALUES (%s,%s,0.6,0.3,0.3,%s,%s,'hash-bad')",
                (lineage["match"], lineage["prediction_run"], NOW, NOW),
            )

    def test_regrade_appends_new_result_version(db: psycopg.Connection, prediction_id: int) -> None:
        db.execute(
            "INSERT INTO prediction_grade (prediction_id, result_version, log_loss, rps,"
            " brier, correct, graded_at_utc) VALUES (%s,0,0.69,0.2,0.4,true,%s)",
            (prediction_id, NOW),
        )
        with pytest.raises(psycopg.errors.UniqueViolation):
            db.execute(
                "INSERT INTO prediction_grade (prediction_id, result_version, log_loss, rps,"
                " brier, correct, graded_at_utc) VALUES (%s,0,0.7,0.2,0.4,true,%s)",
                (prediction_id, NOW),
            )
        db.execute(  # a corrected result (new version) grades again; original retained
            "INSERT INTO prediction_grade (prediction_id, result_version, log_loss, rps,"
            " brier, correct, graded_at_utc) VALUES (%s,1,0.71,0.2,0.4,false,%s)",
            (prediction_id, NOW),
        )
        n = _one(
            db,
            "SELECT count(*) FROM prediction_grade WHERE prediction_id = %s",
            (prediction_id,),
        )
        assert n == 2

    def test_metrics_scope_check(db: psycopg.Connection) -> None:
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(
                "INSERT INTO metrics_snapshot (scope, as_of_utc, payload, created_at_utc)"
                " VALUES ('mixed',%s,'{}',%s)",
                (NOW, NOW),
            )
