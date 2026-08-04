"""Health canary (Contract §9): green path, stale-data failure, overdue-result failure.
Raising IS the alerting mechanism (Lambda Errors alarm, threshold 1)."""

import io
import json
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config

    from jobs import handlers

    class FakeResponse(io.BytesIO):
        status = 200

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *a: Any) -> None:
            return None

    def _fake_urlopen(payload: dict[str, Any]):  # type: ignore[no-untyped-def]
        def opener(url: str, timeout: float = 0) -> FakeResponse:
            return FakeResponse(json.dumps(payload).encode())

        return opener

    @pytest.fixture(autouse=True)
    def _quiet_decision_day_warning(monkeypatch: pytest.MonkeyPatch) -> None:
        """T-281: the seeded DB holds 2026 fixtures and 2026 has no configured Decision Day,
        so the canary's lead-time warning would fire inside every test in this module — but
        only from 45 days before the Oct 6 guard horizon, i.e. from late August onward. That
        is a TIME BOMB: these tests would pass today and start failing on a date nobody
        chose. Pin the lead window closed here; the two tests below open it deliberately and
        assert both sides."""
        monkeypatch.setattr(handlers, "CANARY_DECISION_DAY_LEAD_DAYS", -10_000)

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
        h = one("INSERT INTO team (canonical_name) VALUES ('H') RETURNING team_id")
        a = one("INSERT INTO team (canonical_name) VALUES ('A') RETURNING team_id")
        yield {"conn": conn, "season": season, "h": h, "a": a}
        conn.close()

    @pytest.fixture(autouse=True)
    def _canary_env(monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("KICKLENS_API_URL", "https://api.test")
        monkeypatch.setenv("DATABASE_URL", DATABASE_URL or "")

    def test_green_path(env, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
        monkeypatch.setattr(
            "urllib.request.urlopen",
            _fake_urlopen({"status": "ok", "freshness_ok": True, "last_ingest": "now"}),
        )
        out = handlers.canary({}, None)
        assert out["statusCode"] == 200 and out["overdue_results"] == 0

    def test_unmapped_team_skips_surface_daily(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """ADR-006: the sweep no longer halts on an unmappable club, so the canary is what
        keeps the skip visible — it must raise while the fixture is still being dropped."""
        conn = env["conn"]
        monkeypatch.setattr(
            "urllib.request.urlopen",
            _fake_urlopen({"status": "ok", "freshness_ok": True, "last_ingest": "now"}),
        )
        conn.execute(
            "INSERT INTO job_run (job_name, idempotency_key, status, started_at_utc,"
            " finished_at_utc, details) VALUES ('ingest','canary-adr006','done', now(), now(),"
            ' \'{"unresolved_teams": ["2026-08-01 Some Cup FC [999] v H FC"]}\')'
        )
        try:
            with pytest.raises(RuntimeError, match="unmapped teams"):
                handlers.canary({}, None)
        finally:
            # leave the module's DB clean so the other canary tests stay green-path
            conn.execute("DELETE FROM job_run WHERE idempotency_key = 'canary-adr006'")

    def test_stale_data_raises(env, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
        monkeypatch.setattr(
            "urllib.request.urlopen",
            _fake_urlopen({"status": "ok", "freshness_ok": False, "last_ingest": "old"}),
        )
        with pytest.raises(RuntimeError, match="data stale"):
            handlers.canary({}, None)

    def test_overdue_result_raises_but_postponed_does_not(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "urllib.request.urlopen",
            _fake_urlopen({"status": "ok", "freshness_ok": True, "last_ingest": "now"}),
        )
        conn = env["conn"]
        old = datetime.now(UTC) - timedelta(days=2)
        conn.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " VALUES (%s,%s,%s,%s,'scheduled')",
            (env["season"], env["h"], env["a"], old),
        )
        with pytest.raises(RuntimeError, match="without a final result"):
            handlers.canary({}, None)
        # a postponed match is NOT overdue (it will be superseded, not graded)
        conn.execute("UPDATE match SET status='postponed' WHERE kickoff_utc=%s", (old,))
        out = handlers.canary({}, None)
        assert out["statusCode"] == 200

    def test_missed_forecast_deadman_raises(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A match that kicked off with no official forecast means the inference loop is
        silently broken — the canary must scream. The check is RETROSPECTIVE (fixed
        2026-07-25): the old prospective form only looked at fixtures still in the future,
        a ~90-minute window a once-daily 09:00 UTC canary essentially never lands inside,
        so the dead-man for the worst failure mode could not fire at all."""
        monkeypatch.setattr(
            "urllib.request.urlopen",
            _fake_urlopen({"status": "ok", "freshness_ok": True, "last_ingest": "now"}),
        )
        conn = env["conn"]
        played = datetime.now(UTC) - timedelta(hours=5)  # kicked off, never forecast
        conn.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " VALUES (%s,%s,%s,%s,'scheduled')",
            (env["season"], env["h"], env["a"], played),
        )
        with pytest.raises(RuntimeError, match="NO official forecast"):
            handlers.canary({}, None)
        # a fixture still in the FUTURE is not yet a miss — inference can still forecast it
        conn.execute(
            "UPDATE match SET kickoff_utc=%s WHERE kickoff_utc=%s",
            (datetime.now(UTC) + timedelta(hours=5), played),
        )
        assert handlers.canary({}, None)["missed_forecasts"] == 0
        # postponed fixtures are exempt (they get superseded, not forecast)
        future = datetime.now(UTC) + timedelta(hours=5)
        conn.execute(
            "UPDATE match SET status='postponed', kickoff_utc=%s WHERE kickoff_utc=%s",
            (played, future),
        )
        out = handlers.canary({}, None)
        assert out["statusCode"] == 200 and out["missed_forecasts"] == 0

    def test_cold_health_retries_then_succeeds(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A cold /health (API Lambda + Neon wake) times out once, then succeeds on retry —
        must NOT raise (this is the spurious-alarm fix)."""
        monkeypatch.setattr(handlers, "CANARY_HEALTH_RETRY_SLEEP_S", 0)  # no real sleep
        calls = {"n": 0}
        ok = {"status": "ok", "freshness_ok": True, "last_ingest": "now"}

        def flaky(url: str, timeout: float = 0) -> FakeResponse:
            calls["n"] += 1
            if calls["n"] == 1:
                raise TimeoutError("the read operation timed out")  # cold path
            return FakeResponse(json.dumps(ok).encode())

        monkeypatch.setattr("urllib.request.urlopen", flaky)
        out = handlers.canary({}, None)
        assert out["statusCode"] == 200 and calls["n"] == 2  # retried once, then OK

    def test_health_unreachable_raises_after_retries(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A genuinely down /health (every attempt fails) must still raise -> alarm."""
        monkeypatch.setattr(handlers, "CANARY_HEALTH_RETRY_SLEEP_S", 0)
        calls = {"n": 0}

        def always_timeout(url: str, timeout: float = 0) -> FakeResponse:
            calls["n"] += 1
            raise TimeoutError("the read operation timed out")

        monkeypatch.setattr("urllib.request.urlopen", always_timeout)
        with pytest.raises(RuntimeError, match="unreachable after"):
            handlers.canary({}, None)
        assert calls["n"] == handlers.CANARY_HEALTH_ATTEMPTS  # all attempts exhausted

    def test_missing_api_url_raises(monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("KICKLENS_API_URL", raising=False)
        with pytest.raises(RuntimeError, match="KICKLENS_API_URL"):
            handlers.canary({}, None)

    # ---------- T-281: the unconfigured-Decision-Day warning ----------

    def test_decision_day_warning_fires_inside_the_lead_window(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A season with fixtures but no configured Decision Day must make the canary raise,
        naming the season, the file to edit, and the horizon after which fixtures start being
        REFUSED rather than guessed.

        Seeds its OWN far-future season rather than leaning on 2026's absence: pinning that
        would make this test fail the day the developer configures 2026, i.e. the one action
        this alarm exists to demand."""
        from ingestion.rs_filter import decision_day_for

        year = max(y for y in range(2000, 2100) if decision_day_for(y) is not None) + 50
        conn = env["conn"]
        conn.execute(
            "INSERT INTO season (league_id, year)"
            " SELECT league_id, %s FROM league WHERE code='MLS'"
            " ON CONFLICT (league_id, year) DO NOTHING",
            (year,),
        )
        conn.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " SELECT season_id, %s, %s, %s, 'scheduled' FROM season WHERE year = %s",
            (env["h"], env["a"], datetime(year, 5, 1, tzinfo=UTC), year),
        )
        monkeypatch.setattr(
            "urllib.request.urlopen",
            _fake_urlopen({"status": "ok", "freshness_ok": True, "last_ingest": "now"}),
        )
        # lead wide enough to reach a far-future horizon from today
        monkeypatch.setattr(handlers, "CANARY_DECISION_DAY_LEAD_DAYS", 400_000)
        try:
            with pytest.raises(RuntimeError) as exc:
                handlers.canary({}, None)
            msg = str(exc.value)
            assert str(year) in msg
            assert "decision_days.json" in msg
            assert f"{year}-10-06" in msg  # the derived horizon, stated so it is actionable
        finally:
            conn.execute(
                "DELETE FROM match WHERE kickoff_utc = %s", (datetime(year, 5, 1, tzinfo=UTC),)
            )
            conn.execute("DELETE FROM season WHERE year = %s", (year,))

    def test_decision_day_warning_is_silent_outside_the_lead_window(  # type: ignore[no-untyped-def]
        env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """…and stays quiet until the horizon is near. A canary that pages daily for eight
        months trains you to ignore it, and this same canary guards the missed-forecast
        dead-man — the worst failure this project can have."""
        monkeypatch.setattr(
            "urllib.request.urlopen",
            _fake_urlopen({"status": "ok", "freshness_ok": True, "last_ingest": "now"}),
        )
        monkeypatch.setattr(handlers, "CANARY_DECISION_DAY_LEAD_DAYS", -10_000)
        out = handlers.canary({}, None)
        assert out["statusCode"] == 200
