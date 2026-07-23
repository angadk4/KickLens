"""Launch-review fixes (pre-arm adversarial review): leased job claims, supersession wired
into live ingest, anchor catch-up republisher, Merkle-from-content, ingest handler
claim/visibility + results-only night-window sweep. All integration tests need DATABASE_URL
(the throwaway test DB)."""

import json
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from common.hashing import ForecastFields, forecast_hash, merkle_root

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config
    from common.db import CLAIM_LEASE_MINUTES, claim_job, finish_job
    from ingestion.live import LiveFixture, ingest_live_fixtures
    from models.ledger import (
        Lineage,
        latest_official,
        record_prediction_run,
        write_official_forecast,
    )

    KO = datetime(2026, 7, 25, 23, 30, tzinfo=UTC)

    @pytest.fixture(autouse=True)
    def _anchor_tmp(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
        # local anchor writes (best-effort side channel) go to tmp, never the repo dir
        monkeypatch.setenv("KICKLENS_ANCHOR_DIR", str(tmp_path / "anchors"))

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
        h = one("INSERT INTO team (canonical_name) VALUES ('H FC') RETURNING team_id")
        a = one("INSERT INTO team (canonical_name) VALUES ('A FC') RETURNING team_id")
        for team, key in ((h, "111"), (a, "222")):
            conn.execute(
                "INSERT INTO team_alias (provider, provider_key, team_id)"
                " VALUES ('highlightly',%s,%s)",
                (key, team),
            )
        # minimal registry chain so prediction_run FKs resolve
        from models.champion import make_champion
        from models.registry import (
            create_training_run,
            register_model_version,
            save_model_artifact,
        )

        snap = one(
            "INSERT INTO dataset_snapshot (snapshot_hash, created_at_utc)"
            " VALUES ('lrf-snap', %s) RETURNING dataset_snapshot_id",
            (datetime.now(UTC),),
        )
        trun = create_training_run(
            conn, dataset_snapshot_id=snap, code_git_sha="lrf", seed=42, lockfile_hash="lock"
        )
        mart = save_model_artifact(
            conn, trun, make_champion(), root=tmp_path_factory.mktemp("artifacts")
        )
        mv = register_model_version(
            conn,
            league_id=league,
            model_artifact_id=mart,
            calibration_artifact_id=None,
            version_label="lrf-v1",
        )
        yield {
            "conn": conn,
            "league": league,
            "season": season,
            "h": h,
            "a": a,
            "snapshot": snap,
            "model_version": mv,
        }
        conn.close()

    def _mk_official(
        env: dict[str, Any],
        match_id: int,
        kickoff: datetime,
        *,
        probs: tuple[float, float, float] = (0.5, 0.27, 0.23),
        fields_probs: tuple[float, float, float] | None = None,
    ) -> tuple[int, ForecastFields]:
        """Official forecast with a full lineage chain. fields_probs, when given, diverges
        from the stored row (used to exercise the retry hash-mismatch guard)."""
        conn = env["conn"]
        cutoff = kickoff - timedelta(hours=3)
        creation = cutoff + timedelta(minutes=1)
        freshness = cutoff - timedelta(hours=1)
        frow = conn.execute(
            "INSERT INTO feature_row (match_id, as_of_utc, computed_at_utc, features,"
            " inputs_hash) VALUES (%s,%s,%s,%s,'ih')"
            " ON CONFLICT (match_id, feature_set_version, as_of_utc) DO UPDATE"
            "   SET computed_at_utc = EXCLUDED.computed_at_utc RETURNING feature_row_id",
            (match_id, cutoff, creation, json.dumps({"elo_diff": 1.0})),
        ).fetchone()
        assert frow is not None
        run_id = record_prediction_run(
            conn,
            Lineage(
                match_id=match_id,
                cutoff_utc=cutoff,
                feature_row_id=int(frow[0]),
                feature_set_version="fs-v1",
                dataset_snapshot_id=env["snapshot"],
                data_freshness_time_utc=freshness,
                stale_inputs=False,
                model_version_id=env["model_version"],
                code_git_sha="lrf",
                seed=42,
                lockfile_hash="lock",
                market_snapshot_id=None,
                inputs_hash="ih",
            ),
        )
        fp = fields_probs or probs
        fields = ForecastFields(
            match_id=match_id,
            fixture_revision=0,
            model_version_id=env["model_version"],
            calibration_artifact_id=None,
            feature_set_version="fs-v1",
            p_home=fp[0],
            p_draw=fp[1],
            p_away=fp[2],
            cutoff_utc=cutoff.isoformat(),
            forecast_creation_utc=creation.isoformat(),
            data_freshness_time=freshness.isoformat(),
        )
        pid, _ = write_official_forecast(
            conn,
            prediction_run_id=run_id,
            match_id=match_id,
            kickoff_utc=kickoff,
            fixture_revision=0,
            probs=probs,
            cutoff_utc=cutoff,
            fields_for_hash=fields,
            now=creation,
        )
        return pid, fields

    def _fx(pfid: str, kickoff: datetime, status: str = "scheduled") -> LiveFixture:
        return LiveFixture(
            provider="highlightly",
            provider_fixture_id=pfid,
            kickoff_utc=kickoff,
            status=status,
            home_key="111",
            away_key="222",
            home_goals=None,
            away_goals=None,
            provider_last_updated_utc=None,
        )

    # ---------- leased claims ----------

    def test_claim_lease_reclaims_crashed_and_failed_never_done(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        key = "lrf-claim:2026-07-25"
        job1 = claim_job(conn, "lrf", key)
        assert job1 is not None
        # live lease → a second worker is refused
        assert claim_job(conn, "lrf", key) is None
        # crashed worker: lease expires → reclaimable
        conn.execute(
            "UPDATE job_run SET started_at_utc = started_at_utc - make_interval(mins => %s)"
            " WHERE job_run_id = %s",
            (CLAIM_LEASE_MINUTES + 1, job1),
        )
        job2 = claim_job(conn, "lrf", key)
        assert job2 == job1  # same row, reclaimed
        # failed → immediately reclaimable
        finish_job(conn, job2, status="failed")
        assert claim_job(conn, "lrf", key) == job1
        # done → NEVER reclaimable (idempotency holds)
        finish_job(conn, job1, status="done")
        assert claim_job(conn, "lrf", key) is None

    # ---------- supersession wired into live ingest ----------

    def test_ingest_postponement_voids_official(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        s0 = ingest_live_fixtures(conn, [_fx("801", KO)], env["season"], 2026)
        assert s0["new"] == 1 and s0["voided"] == 0
        row = conn.execute(
            "SELECT match_id FROM source_fixture WHERE provider_fixture_id='801'"
        ).fetchone()
        assert row is not None
        match_id = int(row[0])
        pid, _ = _mk_official(env, match_id, KO)
        assert latest_official(conn, match_id) == pid

        moved = _fx("801", KO + timedelta(days=2), status="postponed")
        s1 = ingest_live_fixtures(conn, [moved], env["season"], 2026)
        assert s1["revisions"] == 1 and s1["voided"] == 1
        assert latest_official(conn, match_id) is None  # old official superseded
        ev = conn.execute(
            "SELECT count(*) FROM prediction_event WHERE prediction_id=%s AND event_type='Voided'",
            (pid,),
        ).fetchone()
        assert ev is not None and int(ev[0]) == 1
        # voided row retained forever; match identity unchanged
        n = conn.execute(
            "SELECT count(*) FROM prediction WHERE match_id=%s", (match_id,)
        ).fetchone()
        assert n is not None and int(n[0]) == 1

    def test_ingest_kickoff_move_alone_voids_official(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        ko = KO + timedelta(days=7)
        ingest_live_fixtures(conn, [_fx("802", ko)], env["season"], 2026)
        row = conn.execute(
            "SELECT match_id FROM source_fixture WHERE provider_fixture_id='802'"
        ).fetchone()
        assert row is not None
        match_id = int(row[0])
        _pid, _ = _mk_official(env, match_id, ko)
        # kickoff slides 3h, status still 'scheduled' → the frozen cutoff is now wrong
        s = ingest_live_fixtures(conn, [_fx("802", ko + timedelta(hours=3))], env["season"], 2026)
        assert s["voided"] == 1 and latest_official(conn, match_id) is None
        # a plain result update never voids
        s2 = ingest_live_fixtures(conn, [_fx("803", ko + timedelta(days=1))], env["season"], 2026)
        assert s2["voided"] == 0

    def test_results_only_never_voids_and_writes_finals_only(env) -> None:  # type: ignore[no-untyped-def]
        """ADR-005 live-window safety: the night sweeps observe games MID-PLAY, where a
        transient provider blip (kickoff wobble / momentary 'postponed') must not void a
        frozen official. results_only ingests completed finals and nothing else."""
        conn = env["conn"]
        ko = KO + timedelta(days=14)
        ingest_live_fixtures(conn, [_fx("804", ko)], env["season"], 2026)
        row = conn.execute(
            "SELECT match_id FROM source_fixture WHERE provider_fixture_id='804'"
        ).fetchone()
        assert row is not None
        match_id = int(row[0])
        pid, _ = _mk_official(env, match_id, ko)

        # (a) a mid-window postponed blip + kickoff wobble: NO void, kickoff untouched
        blip = _fx("804", ko + timedelta(minutes=3), status="postponed")
        s = ingest_live_fixtures(conn, [blip], env["season"], 2026, results_only=True)
        assert s.get("voided", 0) == 0 and s.get("skipped_nonfinal", 0) == 1
        assert latest_official(conn, match_id) == pid  # the frozen official survives
        krow = conn.execute(
            "SELECT kickoff_utc FROM match WHERE match_id=%s", (match_id,)
        ).fetchone()
        assert krow is not None and krow[0] == ko  # cutoff basis never ripples at night

        # (b) a completed final IS written: result + status, still no void, kickoff intact
        done = LiveFixture(
            provider="highlightly",
            provider_fixture_id="804",
            kickoff_utc=ko,
            status="final",
            home_key="111",
            away_key="222",
            home_goals=2,
            away_goals=1,
            provider_last_updated_utc=None,
        )
        s2 = ingest_live_fixtures(conn, [done], env["season"], 2026, results_only=True)
        assert s2["results"] == 1 and s2.get("voided", 0) == 0
        mrow = conn.execute(
            "SELECT status, result, kickoff_utc FROM match WHERE match_id=%s", (match_id,)
        ).fetchone()
        assert mrow is not None and mrow[0] == "final" and mrow[1] == "H" and mrow[2] == ko
        assert latest_official(conn, match_id) == pid  # gradeable at the next :35 run

        # (c) the same postponed report in a FULL sweep still voids (08/20 semantics intact)
        ingest_live_fixtures(conn, [_fx("805", ko + timedelta(days=1))], env["season"], 2026)
        row2 = conn.execute(
            "SELECT match_id FROM source_fixture WHERE provider_fixture_id='805'"
        ).fetchone()
        assert row2 is not None
        _mk_official(env, int(row2[0]), ko + timedelta(days=1))
        s3 = ingest_live_fixtures(
            conn,
            [_fx("805", ko + timedelta(days=3), status="postponed")],
            env["season"],
            2026,
        )
        assert s3["voided"] == 1 and latest_official(conn, int(row2[0])) is None

        # restore the module invariant: no COMPLETED match may carry toy feature rows —
        # the leakage suite's R1 recompute-parity audit (rightly) fails on any it finds
        conn.execute(
            "UPDATE match SET result=NULL, status='postponed', home_goals=NULL,"
            " away_goals=NULL WHERE match_id=%s",
            (match_id,),
        )

    # ---------- anchor catch-up republisher ----------

    def test_retry_failed_anchors_republishes_then_clears(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from models.inference import retry_failed_anchors
        from models.ledger import append_event

        conn = env["conn"]
        ko = KO + timedelta(days=14)
        conn_row = conn.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc)"
            " VALUES (%s,%s,%s,%s) RETURNING match_id",
            (env["season"], env["h"], env["a"], ko),
        ).fetchone()
        assert conn_row is not None
        match_id = int(conn_row[0])
        pid, fields = _mk_official(env, match_id, ko)
        append_event(conn, match_id, "AnchorPushFailed", pid)

        monkeypatch.setenv("GITHUB_ANCHOR_TOKEN", "t")
        monkeypatch.setenv("GITHUB_ANCHOR_REPO", "o/r")
        monkeypatch.setenv("DATABASE_URL", DATABASE_URL or "")
        published: list[ForecastFields] = []

        def fake_publish(f: ForecastFields, **kw: Any) -> bool:
            published.append(f)
            return True

        monkeypatch.setattr("common.anchor.publish_anchor", fake_publish)
        assert retry_failed_anchors(conn) == 1
        # the EXACT frozen field set was reconstructed from the DB and re-published
        assert published and forecast_hash(published[0]) == forecast_hash(fields)
        last = conn.execute(
            "SELECT event_type FROM prediction_event WHERE prediction_id=%s"
            " AND event_type IN ('AnchorPublished','AnchorPushFailed')"
            " ORDER BY prediction_event_id DESC LIMIT 1",
            (pid,),
        ).fetchone()
        assert last is not None and last[0] == "AnchorPublished"
        assert retry_failed_anchors(conn) == 0  # nothing left to catch up

    def test_retry_hash_mismatch_guard_refuses_to_publish(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from models.inference import retry_failed_anchors
        from models.ledger import append_event

        conn = env["conn"]
        ko = KO + timedelta(days=21)
        row = conn.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc)"
            " VALUES (%s,%s,%s,%s) RETURNING match_id",
            (env["season"], env["h"], env["a"], ko),
        ).fetchone()
        assert row is not None
        match_id = int(row[0])
        # stored hash was computed over DIFFERENT probs than the row → reconstruction must
        # NOT match, and the republisher must refuse rather than anchor a wrong hash
        pid, _ = _mk_official(
            env, match_id, ko, probs=(0.5, 0.27, 0.23), fields_probs=(0.4, 0.35, 0.25)
        )
        append_event(conn, match_id, "AnchorPushFailed", pid)
        monkeypatch.setenv("GITHUB_ANCHOR_TOKEN", "t")
        monkeypatch.setenv("GITHUB_ANCHOR_REPO", "o/r")
        monkeypatch.setenv("DATABASE_URL", DATABASE_URL or "")
        calls: list[ForecastFields] = []

        def fake_publish(f: ForecastFields, **kw: Any) -> bool:
            calls.append(f)
            return True

        monkeypatch.setattr("common.anchor.publish_anchor", fake_publish)
        assert retry_failed_anchors(conn) == 0
        assert calls == []  # never published
        last = conn.execute(
            "SELECT event_type FROM prediction_event WHERE prediction_id=%s"
            " AND event_type IN ('AnchorPublished','AnchorPushFailed')"
            " ORDER BY prediction_event_id DESC LIMIT 1",
            (pid,),
        ).fetchone()
        assert last is not None and last[0] == "AnchorPushFailed"  # still flagged

    # ---------- Merkle root from public-repo content ----------

    def test_commit_daily_root_from_content(env) -> None:  # type: ignore[no-untyped-def]
        from datetime import date

        from common.hashing import commit_daily_root_from_content

        conn = env["conn"]
        day = date(2026, 7, 20)
        content = (
            json.dumps({"forecast_hash": "a" * 64})
            + "\n"
            + json.dumps({"forecast_hash": "b" * 64})
            + "\n"
        )
        r1 = commit_daily_root_from_content(conn, day, content)
        r2 = commit_daily_root_from_content(conn, day, content)  # idempotent (first is final)
        assert r1 == r2 == merkle_root(["a" * 64, "b" * 64])
        n = conn.execute("SELECT count(*) FROM anchor_merkle_root WHERE day=%s", (day,)).fetchone()
        assert n is not None and int(n[0]) == 1
        assert commit_daily_root_from_content(conn, date(2026, 7, 21), "") is None

    # ---------- ingest handler: hour claim + total-outage visibility ----------

    def test_ingest_handler_claims_raises_on_total_outage_then_reclaims(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import ingestion.live as live_mod

        from jobs import handlers

        monkeypatch.setenv("DATABASE_URL", DATABASE_URL or "")
        monkeypatch.setenv("HIGHLIGHTLY_KEY", "test-key")

        fixed_now = datetime(2026, 7, 12, 9, 15, tzinfo=UTC)

        class _FixedDT:  # stands in for the module's `datetime` name — only .now is used
            @classmethod
            def now(cls, tz: Any = None) -> datetime:
                return fixed_now

        monkeypatch.setattr(handlers, "datetime", _FixedDT)

        # total outage: every day returns None → the handler must RAISE (Errors alarm)
        monkeypatch.setattr(live_mod, "fetch_with_failover", lambda *a, **kw: None)
        with pytest.raises(RuntimeError, match="ALL days"):
            handlers.ingest({}, None)
        # the failed claim is immediately reclaimable → a healthy retry succeeds
        monkeypatch.setattr(live_mod, "fetch_with_failover", lambda *a, **kw: [])
        out = handlers.ingest({}, None)
        assert out["statusCode"] == 200 and out["failed_days"] == []
        # duplicate delivery inside the same hour bucket → no-op
        out2 = handlers.ingest({}, None)
        assert "skipped" in out2
        # the season row for the current year was ensured (rollover safety)
        srow = (
            env["conn"]
            .execute("SELECT count(*) FROM season WHERE year = %s", (fixed_now.year,))
            .fetchone()
        )
        assert srow is not None and int(srow[0]) == 1

    # ---------- ingest handler: results-only night-window sweep ----------

    def test_ingest_results_only_sweeps_yesterday_and_today_only(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import ingestion.live as live_mod

        from jobs import handlers

        monkeypatch.setenv("DATABASE_URL", DATABASE_URL or "")
        monkeypatch.setenv("HIGHLIGHTLY_KEY", "test-key")

        fixed_now = datetime(2026, 7, 13, 2, 5, tzinfo=UTC)

        class _FixedDT:  # stands in for the module's `datetime` name — only .now is used
            @classmethod
            def now(cls, tz: Any = None) -> datetime:
                return fixed_now

        monkeypatch.setattr(handlers, "datetime", _FixedDT)

        # total outage must stay visible in the NARROWED sweep too (2 days, not 9)
        monkeypatch.setattr(live_mod, "fetch_with_failover", lambda *a, **kw: None)
        with pytest.raises(RuntimeError, match="ALL days"):
            handlers.ingest({"results_only": True}, None)

        swept: list[str] = []

        def record(adapters: Any, day: Any, year: Any, **kw: Any) -> list[Any]:
            swept.append(day.isoformat())
            return []

        monkeypatch.setattr(live_mod, "fetch_with_failover", record)
        out = handlers.ingest({"results_only": True}, None)
        assert out["statusCode"] == 200 and out["failed_days"] == []
        # exactly yesterday + today — the only days carrying just-finished finals
        assert swept == ["2026-07-12", "2026-07-13"]
        # the run recorded its job_run under the same hour-bucket key scheme…
        jrow = (
            env["conn"]
            .execute("SELECT status FROM job_run WHERE idempotency_key = 'ingest:20260713T02'")
            .fetchone()
        )
        assert jrow is not None and jrow[0] == "done"
        # …so a duplicate delivery inside the same hour still no-ops
        assert "skipped" in handlers.ingest({"results_only": True}, None)

    def test_ingest_default_sweep_unchanged(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import ingestion.live as live_mod

        from jobs import handlers

        monkeypatch.setenv("DATABASE_URL", DATABASE_URL or "")
        monkeypatch.setenv("HIGHLIGHTLY_KEY", "test-key")

        fixed_now = datetime(2026, 7, 13, 20, 0, tzinfo=UTC)

        class _FixedDT:  # stands in for the module's `datetime` name — only .now is used
            @classmethod
            def now(cls, tz: Any = None) -> datetime:
                return fixed_now

        monkeypatch.setattr(handlers, "datetime", _FixedDT)

        swept: list[str] = []

        def record(adapters: Any, day: Any, year: Any, **kw: Any) -> list[Any]:
            swept.append(day.isoformat())
            return []

        monkeypatch.setattr(live_mod, "fetch_with_failover", record)
        out = handlers.ingest({}, None)
        assert out["statusCode"] == 200
        # without the flag the frozen -1..+7 horizon is untouched
        assert swept == [f"2026-07-{d:02d}" for d in range(12, 21)]
