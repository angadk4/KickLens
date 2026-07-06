"""T-150/T-151/T-132/T-133: end-to-end finalization + audit invariants (test DB).

Synthetic mini-league history + one upcoming fixture; a production model is trained on the
history, registered, promoted; then the finalization path is exercised end to end.
"""

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import common.hashing as hashing
    import psycopg
    from alembic import command
    from alembic.config import Config
    from common.hashing import forecast_hash
    from models.champion import fit_champion_with_calibration
    from models.inference import finalize_fixture, fixtures_due, generate_draft
    from models.ledger import latest_official, void_official
    from models.registry import (
        create_training_run,
        promote,
        register_model_version,
        save_calibration_artifact,
        save_model_artifact,
    )
    from models.walkforward import Sample, week_key

    T0 = datetime(2026, 2, 21, 20, 0, tzinfo=UTC)
    KICKOFF = T0 + timedelta(days=140)  # the upcoming fixture
    NOW_AT_CUTOFF = KICKOFF - timedelta(hours=2, minutes=50)  # just past T-3h

    @pytest.fixture(scope="module")
    def env(tmp_path_factory: pytest.TempPathFactory):  # type: ignore[no-untyped-def]
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
        teams = [
            one("INSERT INTO team (canonical_name) VALUES (%s) RETURNING team_id", (f"T{i}",))
            for i in range(4)
        ]
        # 200 completed round-robin matches with a deterministic result pattern
        samples: list[Sample] = []
        mid = 0
        for r in range(34):
            for i in range(4):
                for j in range(i + 1, 4):
                    ko = T0 + timedelta(days=r * 4 + i + j)
                    if ko >= KICKOFF - timedelta(hours=4):
                        continue
                    hg, ag = (
                        (2, 0)
                        if (i + j + r) % 3 == 0
                        else (1, 1)
                        if (i + j + r) % 3 == 1
                        else (0, 1)
                    )
                    res = "H" if hg > ag else "D" if hg == ag else "A"
                    match_id = one(
                        "INSERT INTO match (season_id, home_team_id, away_team_id,"
                        " kickoff_utc, status, home_goals, away_goals, result)"
                        " VALUES (%s,%s,%s,%s,'final',%s,%s,%s) RETURNING match_id",
                        (season, teams[i], teams[j], ko, hg, ag, res),
                    )
                    mid += 1
                    samples.append(
                        Sample(
                            match_id=match_id,
                            season_year=2026,
                            kickoff_utc=ko,
                            week=week_key(ko),
                            features={"elo_diff": float(10 * (j - i)), "neutral_site": 0.0},
                            outcome=res,
                            home_team_id=teams[i],
                            away_team_id=teams[j],
                            home_goals=hg,
                            away_goals=ag,
                        )
                    )
        upcoming = one(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc)"
            " VALUES (%s,%s,%s,%s) RETURNING match_id",
            (season, teams[0], teams[1], KICKOFF),
        )
        snap = one(
            "INSERT INTO dataset_snapshot (snapshot_hash, created_at_utc)"
            " VALUES ('fin-snap',%s) RETURNING dataset_snapshot_id",
            (NOW_AT_CUTOFF - timedelta(hours=2),),  # fresh (< 36h)
        )
        # train + register + promote the production model (frozen recipe)
        k = max(1, len(samples) // 5)
        model, cal = fit_champion_with_calibration(samples, samples[-k:])
        trun = create_training_run(
            conn, dataset_snapshot_id=snap, code_git_sha="e2e", seed=42, lockfile_hash="lock"
        )
        root = tmp_path_factory.mktemp("artifacts")
        mart = save_model_artifact(conn, trun, model, root=root)
        cart = save_calibration_artifact(
            conn, trun, cal, param_t=cal.temperature if cal.fitted else None, root=root
        )
        mv = register_model_version(
            conn,
            league_id=league,
            model_artifact_id=mart,
            calibration_artifact_id=cart,
            version_label="e2e-v1",
        )
        promote(conn, mv)
        yield {"conn": conn, "match": upcoming, "league": league, "mv": mv}
        conn.close()

    def test_state_gate_lists_only_due_fixtures(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        before_cutoff = KICKOFF - timedelta(hours=4)
        assert env["match"] not in fixtures_due(conn, before_cutoff)  # not yet due
        assert env["match"] in fixtures_due(conn, NOW_AT_CUTOFF)  # due at T-3h
        assert env["match"] not in fixtures_due(conn, KICKOFF)  # kicked off → never

    def test_finalize_produces_one_official_and_rerun_is_noop(  # type: ignore[no-untyped-def]
        env, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(hashing, "ANCHOR_DIR", tmp_path)
        conn = env["conn"]
        pid = finalize_fixture(conn, env["match"], NOW_AT_CUTOFF)
        assert pid is not None
        # T-151: re-run = no duplicate official
        again = finalize_fixture(conn, env["match"], NOW_AT_CUTOFF + timedelta(minutes=30))
        assert again is None
        n = conn.execute(
            "SELECT count(*) FROM prediction WHERE match_id=%s", (env["match"],)
        ).fetchone()
        assert n is not None and int(n[0]) == 1
        env["prediction"] = pid

    def test_probabilities_valid_and_lineage_complete(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        row = conn.execute(
            "SELECT p.p_home, p.p_draw, p.p_away, r.code_git_sha, r.lockfile_hash,"
            " r.inputs_hash, r.stale_inputs, r.model_version_id"
            " FROM prediction p JOIN prediction_run r USING (prediction_run_id)"
            " WHERE p.prediction_id = %s",
            (env["prediction"],),
        ).fetchone()
        assert row is not None
        assert abs(float(row[0]) + float(row[1]) + float(row[2]) - 1.0) < 1e-6
        assert all(v is not None for v in row[3:6])
        assert row[6] is False  # fresh inputs
        assert int(row[7]) == env["mv"]

    def test_registry_untouched_by_inference(env) -> None:  # type: ignore[no-untyped-def]
        # T-150 AC: inference reads the registry, never writes it
        n = env["conn"].execute("SELECT count(*) FROM model_version").fetchone()
        assert n is not None and int(n[0]) == 1

    def test_hash_recompute_matches_stored(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        row = conn.execute(
            "SELECT p.forecast_hash, p.match_id, p.fixture_revision, r.model_version_id,"
            " p.p_home, p.p_draw, p.p_away, p.cutoff_utc, p.forecast_creation_utc,"
            " r.data_freshness_time_utc"
            " FROM prediction p JOIN prediction_run r USING (prediction_run_id)"
            " WHERE p.prediction_id=%s",
            (env["prediction"],),
        ).fetchone()
        assert row is not None
        from common.hashing import ForecastFields

        fields = ForecastFields(
            match_id=int(row[1]),
            fixture_revision=int(row[2]),
            model_version_id=int(row[3]),
            calibration_artifact_id=None,
            feature_set_version="fs-v1",
            p_home=float(row[4]),
            p_draw=float(row[5]),
            p_away=float(row[6]),
            cutoff_utc=row[7].isoformat(),
            forecast_creation_utc=row[8].isoformat(),
            data_freshness_time=row[9].isoformat(),
        )
        assert forecast_hash(fields) == row[0]  # tamper-evidence: recompute == stored

    def test_supersession_new_official_at_new_cutoff(  # type: ignore[no-untyped-def]
        env, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(hashing, "ANCHOR_DIR", tmp_path)
        conn = env["conn"]
        void_official(conn, env["prediction"], env["match"], reason="postponed")
        new_kick = KICKOFF + timedelta(days=3)
        conn.execute("UPDATE match SET kickoff_utc=%s WHERE match_id=%s", (new_kick, env["match"]))
        conn.execute(
            "INSERT INTO source_fixture (provider, provider_fixture_id, fixture_revision,"
            " match_id, kickoff_utc, fetched_at_utc) VALUES ('highlightly','X',1,%s,%s,%s)",
            (env["match"], new_kick, new_kick - timedelta(days=4)),
        )
        pid2 = finalize_fixture(conn, env["match"], new_kick - timedelta(hours=2, minutes=45))
        assert pid2 is not None and pid2 != env["prediction"]
        assert latest_official(conn, env["match"]) == pid2
        n = conn.execute(
            "SELECT count(*) FROM prediction WHERE match_id=%s", (env["match"],)
        ).fetchone()
        assert n is not None and int(n[0]) == 2  # old row retained forever

    def test_draft_window_overwritable_never_hashed(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        now = KICKOFF - timedelta(days=10)
        assert generate_draft(conn, env["match"], now) is False  # outside 7-day window
        now = KICKOFF + timedelta(days=3) - timedelta(days=5)  # new kickoff - 5d
        assert generate_draft(conn, env["match"], now) is True
        assert generate_draft(conn, env["match"], now + timedelta(days=1)) is True  # overwrite
        row = conn.execute(
            "SELECT count(*) FROM draft_prediction WHERE match_id=%s", (env["match"],)
        ).fetchone()
        assert row is not None and int(row[0]) == 1  # upsert, not append
        cols = {
            r[0]
            for r in conn.execute(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_name='draft_prediction'"
            ).fetchall()
        }
        assert "forecast_hash" not in cols  # drafts are structurally unhashable
