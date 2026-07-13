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
        """Launch-review fix: a future fixture past cutoff+90min with no official forecast
        means the inference loop is silently broken — the canary must scream."""
        monkeypatch.setattr(
            "urllib.request.urlopen",
            _fake_urlopen({"status": "ok", "freshness_ok": True, "last_ingest": "now"}),
        )
        conn = env["conn"]
        soon = datetime.now(UTC) + timedelta(minutes=60)  # cutoff passed 120min ago
        conn.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc, status)"
            " VALUES (%s,%s,%s,%s,'scheduled')",
            (env["season"], env["h"], env["a"], soon),
        )
        with pytest.raises(RuntimeError, match="NO official forecast"):
            handlers.canary({}, None)
        # postponed fixtures are exempt (they get superseded, not forecast)
        conn.execute("UPDATE match SET status='postponed' WHERE kickoff_utc=%s", (soon,))
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
