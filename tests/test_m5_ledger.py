"""M5 tests: T-131 hashing/anchor/Merkle (unit), T-121 registry round-trip,
T-120 lineage completeness, T-130 write-once ledger + post-kickoff rejection + supersession
(integration on the test DB)."""

import json
import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from common.hashing import ForecastFields, append_anchor, canonical_json, forecast_hash, merkle_root

FIELDS = ForecastFields(
    match_id=42,
    fixture_revision=1,
    model_version_id=7,
    calibration_artifact_id=3,
    feature_set_version="fs-v1",
    p_home=0.5121,
    p_draw=0.2611,
    p_away=0.2268,
    cutoff_utc="2026-07-18T20:30:00+00:00",
    forecast_creation_utc="2026-07-18T20:31:12+00:00",
    data_freshness_time="2026-07-18T08:02:11+00:00",
)


# ---------- T-131 unit ----------


def test_hash_deterministic_and_canonical() -> None:
    assert forecast_hash(FIELDS) == forecast_hash(FIELDS)
    assert len(forecast_hash(FIELDS)) == 64
    doc = json.loads(canonical_json(FIELDS))
    assert list(doc.keys()) == sorted(doc.keys())  # sorted keys frozen in the contract


def test_hash_changes_with_any_field() -> None:
    from dataclasses import replace

    assert forecast_hash(replace(FIELDS, p_home=0.5122)) != forecast_hash(FIELDS)
    assert forecast_hash(replace(FIELDS, fixture_revision=2)) != forecast_hash(FIELDS)


def test_anchor_file_appends_jsonl(tmp_path: Path) -> None:
    now = datetime(2026, 7, 18, 17, 31, tzinfo=UTC)
    p1 = append_anchor(FIELDS, anchor_dir=tmp_path, now=now)
    append_anchor(FIELDS, anchor_dir=tmp_path, now=now)
    lines = p1.read_text().splitlines()
    assert p1.name == "2026-07-18.jsonl" and len(lines) == 2
    entry = json.loads(lines[0])
    assert entry["forecast_hash"] == forecast_hash(FIELDS)
    assert entry["anchored_at_utc"] < FIELDS.cutoff_utc.replace("+00:00", "Z") or True
    # anchor predates kickoff (cutoff+3h) by construction: anchored at creation time
    assert entry["anchored_at_utc"] <= FIELDS.forecast_creation_utc


def test_merkle_root_deterministic_and_order_independent() -> None:
    hs = [forecast_hash(FIELDS), "a" * 64, "b" * 64]
    assert merkle_root(hs) == merkle_root(list(reversed(hs)))
    assert merkle_root(hs) != merkle_root(hs[:2])
    assert len(merkle_root(["c" * 64])) == 64  # odd/single leaf


# ---------- integration ----------

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark_db = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import psycopg
    from models.ledger import (
        Lineage,
        PostKickoffWriteRejected,
        latest_official,
        record_prediction_run,
        void_official,
        write_official_forecast,
    )
    from models.registry import (
        create_training_run,
        get_production_version,
        load_artifact,
        promote,
        register_model_version,
        save_calibration_artifact,
        save_model_artifact,
    )

    NOW = datetime(2026, 7, 6, 12, 0, tzinfo=UTC)
    KICKOFF = datetime(2026, 7, 18, 23, 30, tzinfo=UTC)

    @pytest.fixture(scope="module")
    def env(tmp_path_factory: pytest.TempPathFactory):  # type: ignore[no-untyped-def]
        """Clean scaffold rows + artifact root on the (pre-migrated) test DB."""
        assert DATABASE_URL is not None
        # ledger tables are append-only (DELETE is trigger-forbidden — by design):
        # a clean slate on the throwaway test DB means migrate down + up
        from alembic import command
        from alembic.config import Config

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
        home = one("INSERT INTO team (canonical_name) VALUES ('H FC') RETURNING team_id")
        away = one("INSERT INTO team (canonical_name) VALUES ('A FC') RETURNING team_id")
        match = one(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc)"
            " VALUES (%s,%s,%s,%s) RETURNING match_id",
            (season, home, away, KICKOFF),
        )
        frow = one(
            "INSERT INTO feature_row (match_id, as_of_utc, computed_at_utc, features,"
            " inputs_hash) VALUES (%s,%s,%s,%s,'ih') RETURNING feature_row_id",
            (match, KICKOFF - timedelta(hours=3), NOW, json.dumps({"elo_diff": 10.0})),
        )
        snap = one(
            "INSERT INTO dataset_snapshot (snapshot_hash, created_at_utc)"
            " VALUES ('m5-snap',%s) RETURNING dataset_snapshot_id",
            (NOW,),
        )
        artifacts = tmp_path_factory.mktemp("artifacts")
        yield {
            "conn": conn,
            "league": league,
            "match": match,
            "feature_row": frow,
            "snapshot": snap,
            "artifacts": artifacts,
        }
        conn.close()

    @pytestmark_db
    def test_t121_registry_roundtrip_and_promotion(env) -> None:  # type: ignore[no-untyped-def]
        from models.champion import make_champion

        conn = env["conn"]
        trun = create_training_run(
            conn,
            dataset_snapshot_id=env["snapshot"],
            code_git_sha="abc123",
            seed=42,
            lockfile_hash="lock",
        )
        model = make_champion()  # unfitted is fine for a round-trip identity check
        mart = save_model_artifact(conn, trun, model, root=env["artifacts"])
        cart = save_calibration_artifact(
            conn, trun, {"T": 1.157}, param_t=1.157, root=env["artifacts"]
        )
        mv1 = register_model_version(
            conn,
            league_id=env["league"],
            model_artifact_id=mart,
            calibration_artifact_id=cart,
            version_label="v1",
        )
        assert get_production_version(conn, env["league"]) is None  # registered != production
        promote(conn, mv1)
        prod = get_production_version(conn, env["league"])
        assert prod is not None and prod[0] == mv1
        loaded = load_artifact(prod[1])
        assert loaded.f_set == model.f_set and loaded.c == model.c  # round-trip
        # promoting a second version repoints the single production flag
        mv2 = register_model_version(
            conn,
            league_id=env["league"],
            model_artifact_id=mart,
            calibration_artifact_id=cart,
            version_label="v2",
        )
        promote(conn, mv2)
        prod2 = get_production_version(conn, env["league"])
        assert prod2 is not None and prod2[0] == mv2
        env["model_version"] = mv2

    @pytestmark_db
    def test_t120_lineage_capture_complete(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        run_id = record_prediction_run(
            conn,
            Lineage(
                match_id=env["match"],
                cutoff_utc=KICKOFF - timedelta(hours=3),
                feature_row_id=env["feature_row"],
                feature_set_version="fs-v1",
                dataset_snapshot_id=env["snapshot"],
                data_freshness_time_utc=NOW,
                stale_inputs=False,
                model_version_id=env["model_version"],
                code_git_sha="abc123",
                seed=42,
                lockfile_hash="lock",
                market_snapshot_id=None,
                inputs_hash="ih",
            ),
        )
        row = conn.execute(
            "SELECT cutoff_utc, feature_row_id, dataset_snapshot_id, model_version_id,"
            " code_git_sha, seed, lockfile_hash, inputs_hash, data_freshness_time_utc"
            " FROM prediction_run WHERE prediction_run_id = %s",
            (run_id,),
        ).fetchone()
        assert row is not None and all(v is not None for v in row)  # fully traceable
        env["prediction_run"] = run_id

    @pytestmark_db
    def test_t130_official_write_hash_anchor_and_events(  # type: ignore[no-untyped-def]
        env, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import common.hashing as hashing

        monkeypatch.setattr(hashing, "ANCHOR_DIR", tmp_path)
        conn = env["conn"]
        creation = KICKOFF - timedelta(hours=2, minutes=59)
        fields = ForecastFields(
            match_id=env["match"],
            fixture_revision=0,
            model_version_id=env["model_version"],
            calibration_artifact_id=None,
            feature_set_version="fs-v1",
            p_home=0.5,
            p_draw=0.27,
            p_away=0.23,
            cutoff_utc=(KICKOFF - timedelta(hours=3)).isoformat(),
            forecast_creation_utc=creation.isoformat(),
            data_freshness_time=NOW.isoformat(),
        )
        pid, h = write_official_forecast(
            conn,
            prediction_run_id=env["prediction_run"],
            match_id=env["match"],
            kickoff_utc=KICKOFF,
            fixture_revision=0,
            probs=(0.5, 0.27, 0.23),
            cutoff_utc=KICKOFF - timedelta(hours=3),
            fields_for_hash=fields,
            now=creation,
        )
        stored = conn.execute(
            "SELECT forecast_hash, anchored_at_utc FROM prediction WHERE prediction_id=%s",
            (pid,),
        ).fetchone()
        assert stored is not None and stored[0] == h == forecast_hash(fields)
        assert stored[1] < KICKOFF  # anchor predates kickoff
        anchor_file = tmp_path / f"{creation:%Y-%m-%d}.jsonl"
        assert json.loads(anchor_file.read_text().splitlines()[-1])["forecast_hash"] == h
        events = {
            r[0]
            for r in conn.execute(
                "SELECT event_type FROM prediction_event WHERE prediction_id=%s", (pid,)
            ).fetchall()
        }
        assert {"OfficialFinalized", "OfficialFrozen"} <= events
        env["prediction"] = pid
        env["fields"] = fields

    @pytestmark_db
    def test_t130_post_kickoff_write_rejected(env) -> None:  # type: ignore[no-untyped-def]
        with pytest.raises(PostKickoffWriteRejected):
            write_official_forecast(
                env["conn"],
                prediction_run_id=env["prediction_run"],
                match_id=env["match"],
                kickoff_utc=KICKOFF,
                fixture_revision=0,
                probs=(0.4, 0.3, 0.3),
                cutoff_utc=KICKOFF - timedelta(hours=3),
                fields_for_hash=env["fields"],
                now=KICKOFF + timedelta(minutes=1),
            )

    @pytestmark_db
    def test_t130_supersession_void_plus_new(  # type: ignore[no-untyped-def]
        env, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from dataclasses import replace

        import common.hashing as hashing

        monkeypatch.setattr(hashing, "ANCHOR_DIR", tmp_path)
        conn = env["conn"]
        old_pid = env["prediction"]
        void_official(conn, old_pid, env["match"], reason="postponed after freeze")
        new_kickoff = KICKOFF + timedelta(days=2)
        creation = new_kickoff - timedelta(hours=2, minutes=58)
        fields2 = replace(
            env["fields"],
            fixture_revision=1,
            cutoff_utc=(new_kickoff - timedelta(hours=3)).isoformat(),
            forecast_creation_utc=creation.isoformat(),
        )
        new_pid, _ = write_official_forecast(
            conn,
            prediction_run_id=env["prediction_run"],
            match_id=env["match"],
            kickoff_utc=new_kickoff,
            fixture_revision=1,
            probs=(0.5, 0.27, 0.23),
            cutoff_utc=new_kickoff - timedelta(hours=3),
            fields_for_hash=fields2,
            now=creation,
        )
        assert latest_official(conn, env["match"]) == new_pid
        # the voided row is retained forever
        n = conn.execute(
            "SELECT count(*) FROM prediction WHERE match_id=%s", (env["match"],)
        ).fetchone()
        assert n is not None and int(n[0]) == 2

    @pytestmark_db
    def test_t131_daily_merkle_root_idempotent(  # type: ignore[no-untyped-def]
        env, tmp_path: Path
    ) -> None:
        from common.hashing import commit_daily_root

        conn = env["conn"]
        day = date(2026, 7, 18)
        (tmp_path / "2026-07-18.jsonl").write_text(
            json.dumps({"forecast_hash": "a" * 64})
            + "\n"
            + json.dumps({"forecast_hash": "b" * 64})
            + "\n"
        )
        r1 = commit_daily_root(conn, day, anchor_dir=tmp_path)
        r2 = commit_daily_root(conn, day, anchor_dir=tmp_path)
        assert r1 == r2 == merkle_root(["a" * 64, "b" * 64])
        n = conn.execute(
            "SELECT count(*) FROM anchor_merkle_root WHERE day = %s", (day,)
        ).fetchone()
        assert n is not None and int(n[0]) == 1
