"""T-160/161/162 + T-170/171: grading correctness, idempotency, regrade-retains-original,
duplicate prevention, metrics recompute determinism, evidence-scope enforcement."""

import math
import os
from datetime import UTC, datetime, timedelta

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config
    from models.aggregation import latest_snapshot, recompute_live_snapshot, write_snapshot
    from models.grading import apply_result_correction, grade_all_pending, grade_match

    KICKOFF = datetime(2026, 7, 18, 23, 30, tzinfo=UTC)

    @pytest.fixture(scope="module")
    def env():  # type: ignore[no-untyped-def]
        assert DATABASE_URL is not None
        cfg = Config("alembic.ini")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        conn = psycopg.connect(DATABASE_URL, autocommit=True)

        def one(sql: str, args: tuple[object, ...] = ()) -> int:
            row = (conn.execute(sql, args) if args else conn.execute(sql)).fetchone()
            assert row is not None
            return int(row[0])

        league = one("INSERT INTO league (code,name) VALUES ('MLS','MLS') RETURNING league_id")
        season = one(
            "INSERT INTO season (league_id, year) VALUES (%s, 2026) RETURNING season_id",
            (league,),
        )
        home = one("INSERT INTO team (canonical_name) VALUES ('H') RETURNING team_id")
        away = one("INSERT INTO team (canonical_name) VALUES ('A') RETURNING team_id")
        # a finished match with an official forecast (minimal lineage chain)
        match = one(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status,"
            " home_goals, away_goals, result) VALUES (%s,%s,%s,%s,'final',2,1,'H')"
            " RETURNING match_id",
            (season, home, away, KICKOFF),
        )
        frow = one(
            "INSERT INTO feature_row (match_id, as_of_utc, computed_at_utc, features,"
            " inputs_hash) VALUES (%s,%s,%s,'{}','ih') RETURNING feature_row_id",
            (match, KICKOFF - timedelta(hours=3), KICKOFF - timedelta(hours=3)),
        )
        snap = one(
            "INSERT INTO dataset_snapshot (snapshot_hash, created_at_utc)"
            " VALUES ('g-snap', %s) RETURNING dataset_snapshot_id",
            (KICKOFF,),
        )
        trun = one(
            "INSERT INTO training_run (dataset_snapshot_id, code_git_sha, seed, lockfile_hash,"
            " started_at_utc) VALUES (%s,'g',42,'l',%s) RETURNING training_run_id",
            (snap, KICKOFF),
        )
        mart = one(
            "INSERT INTO model_artifact (training_run_id, artifact_uri, artifact_hash,"
            " created_at_utc) VALUES (%s,'file:///x','h',%s) RETURNING model_artifact_id",
            (trun, KICKOFF),
        )
        mv = one(
            "INSERT INTO model_version (league_id, model_artifact_id, version_label,"
            " is_production, created_at_utc) VALUES (%s,%s,'g-v1',true,%s)"
            " RETURNING model_version_id",
            (league, mart, KICKOFF),
        )
        prun = one(
            "INSERT INTO prediction_run (match_id, cutoff_utc, feature_row_id,"
            " data_freshness_time_utc, model_version_id, code_git_sha, seed, lockfile_hash,"
            " inputs_hash, created_at_utc) VALUES (%s,%s,%s,%s,%s,'g',42,'l','ih',%s)"
            " RETURNING prediction_run_id",
            (match, KICKOFF - timedelta(hours=3), frow, KICKOFF, mv, KICKOFF),
        )
        pred = one(
            "INSERT INTO prediction (match_id, prediction_run_id, p_home, p_draw, p_away,"
            " cutoff_utc, forecast_creation_utc, forecast_hash)"
            " VALUES (%s,%s,0.6,0.25,0.15,%s,%s,'g-hash') RETURNING prediction_id",
            (match, prun, KICKOFF - timedelta(hours=3), KICKOFF - timedelta(hours=2)),
        )
        yield {"conn": conn, "match": match, "prediction": pred}
        conn.close()

    def test_grading_correct_values_and_event(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        gid = grade_match(conn, env["match"])
        assert gid is not None
        row = conn.execute(
            "SELECT log_loss, rps, brier, correct, result_version FROM prediction_grade"
            " WHERE prediction_grade_id=%s",
            (gid,),
        ).fetchone()
        assert row is not None
        # H happened with p=(0.6,0.25,0.15): ll=-ln(0.6); rps=((0.6-1)^2+(0.85-1)^2)/2
        assert float(row[0]) == pytest.approx(-math.log(0.6))
        assert float(row[1]) == pytest.approx(((0.6 - 1) ** 2 + (0.85 - 1) ** 2) / 2)
        assert float(row[2]) == pytest.approx(0.16 + 0.0625 + 0.0225)
        assert row[3] is True and int(row[4]) == 0
        events = [
            r[0]
            for r in conn.execute(
                "SELECT event_type FROM prediction_event WHERE prediction_id=%s"
                " ORDER BY prediction_event_id",
                (env["prediction"],),
            ).fetchall()
        ]
        assert "Graded" in events

    def test_duplicate_grade_prevented(env) -> None:  # type: ignore[no-untyped-def]
        assert grade_match(env["conn"], env["match"]) is None  # idempotent
        assert grade_all_pending(env["conn"]) == 0
        n = env["conn"].execute("SELECT count(*) FROM prediction_grade").fetchone()
        assert n is not None and int(n[0]) == 1

    def test_regrade_on_correction_retains_original(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        new_version = apply_result_correction(conn, env["match"], 1, 1)  # now a draw
        assert new_version == 1
        gid2 = grade_match(conn, env["match"])
        assert gid2 is not None
        rows = conn.execute(
            "SELECT result_version, log_loss, correct FROM prediction_grade"
            " WHERE prediction_id=%s ORDER BY result_version",
            (env["prediction"],),
        ).fetchall()
        assert len(rows) == 2  # original retained
        assert float(rows[1][1]) == pytest.approx(-math.log(0.25))  # regraded vs D
        assert rows[0][2] is True and rows[1][2] is False
        events = [
            r[0]
            for r in conn.execute(
                "SELECT event_type FROM prediction_event WHERE match_id=%s", (env["match"],)
            ).fetchall()
        ]
        assert "Corrected" in events and "Regraded" in events

    def test_metrics_use_latest_grade_and_are_deterministic(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        s1 = recompute_live_snapshot(conn)
        s2 = recompute_live_snapshot(conn)
        assert s1 != s2  # separate snapshot rows...
        a = latest_snapshot(conn, "live")
        assert a is not None
        assert a["n"] == 1
        ll = a["log_loss"]
        assert isinstance(ll, float)
        assert ll == pytest.approx(-math.log(0.25))  # latest grade (the regrade)
        assert a["accuracy"] == 0.0 and a["_scope"] == "live"

    def test_evidence_scopes_never_merge(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        write_snapshot(conn, "dev", {"n": 3012, "log_loss": 1.0346})
        live = latest_snapshot(conn, "live")
        dev = latest_snapshot(conn, "dev")
        assert live is not None and dev is not None
        assert live["_scope"] == "live" and dev["_scope"] == "dev"
        assert live["n"] != dev["n"]  # the tiny live record never inherits dev numbers
        import psycopg.errors

        with pytest.raises(psycopg.errors.CheckViolation):
            write_snapshot(conn, "mixed", {})  # type: ignore[arg-type]
