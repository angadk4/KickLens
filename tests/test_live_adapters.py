"""T-140/141/142/143 tests: canonical parity, status mapping, retry/failover ladder,
revision-bump ingestion (integration), odds capture window + conversion."""

import os
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from ingestion.live import (
    ApiFootballAdapter,
    HighlightlyAdapter,
    LiveFixture,
    ProviderError,
    fetch_with_failover,
)
from ingestion.odds import CAPTURE_WINDOW, ODD_IDS, SportsGameOddsAdapter, american_to_decimal

DAY = date(2026, 7, 18)
KICKOFF = "2026-07-18T23:30:00.000Z"


def hl_payload() -> dict[str, Any]:
    return {
        "data": [
            {
                "id": 1268271614,
                "date": KICKOFF,
                "state": {"description": "Finished", "score": {"current": "2 - 1"}},
                "homeTeam": {"id": 111, "name": "H"},
                "awayTeam": {"id": 222, "name": "A"},
            },
            {
                "id": 999,
                "date": KICKOFF,
                "state": {"description": "Not started", "score": {}},
                "homeTeam": {"id": 111, "name": "H"},
                "awayTeam": {"id": 333, "name": "B"},
            },
        ]
    }


def af_payload() -> dict[str, Any]:
    return {
        "response": [
            {
                "fixture": {"id": 42, "date": KICKOFF, "status": {"short": "FT"}},
                "teams": {"home": {"id": 111}, "away": {"id": 222}},
                "goals": {"home": 2, "away": 1},
            }
        ]
    }


def test_adapters_emit_identical_canonical_rows() -> None:
    hl = HighlightlyAdapter("k", transport=lambda url, h: hl_payload())
    af = ApiFootballAdapter("k", transport=lambda url, h: af_payload())
    a = hl.fixtures(DAY, 2026)[0]
    b = af.fixtures(DAY, 2026)[0]
    for fx in (a, b):
        assert fx.kickoff_utc == datetime(2026, 7, 18, 23, 30, tzinfo=UTC)
        assert fx.status == "final"
        assert (fx.home_goals, fx.away_goals) == (2, 1)
        assert (fx.home_key, fx.away_key) == ("111", "222")


def test_status_mapping_not_started_and_postponed() -> None:
    payload = hl_payload()
    payload["data"][1]["state"]["description"] = "Postponed"
    hl = HighlightlyAdapter("k", transport=lambda url, h: payload)
    fixtures = hl.fixtures(DAY, 2026)
    assert fixtures[0].status == "final"
    assert fixtures[1].status == "postponed"
    assert fixtures[1].home_goals is None  # empty score parses to None


def test_retries_then_provider_error() -> None:
    calls: list[float] = []

    def failing(url: str, h: dict[str, str]) -> dict[str, Any]:
        raise OSError("network down")

    hl = HighlightlyAdapter("k", transport=failing)
    with pytest.raises(ProviderError):
        hl.fixtures(DAY, 2026, sleep=calls.append)
    assert calls == [5.0, 25.0, 125.0]  # frozen backoff ladder, then give up


def test_failover_primary_to_backup_to_none() -> None:
    def failing(url: str, h: dict[str, str]) -> dict[str, Any]:
        raise OSError("down")

    hl_bad = HighlightlyAdapter("k", transport=failing)
    af_good = ApiFootballAdapter("k", transport=lambda url, h: af_payload())
    out = fetch_with_failover([hl_bad, af_good], DAY, 2026, sleep=lambda _s: None)
    assert out is not None and out[0].provider == "api-football"
    af_bad = ApiFootballAdapter("k", transport=failing)
    assert fetch_with_failover([hl_bad, af_bad], DAY, 2026, sleep=lambda _s: None) is None


def test_api_football_plan_error_raises() -> None:
    af = ApiFootballAdapter(
        "k", transport=lambda url, h: {"errors": {"plan": "not in your plan"}, "response": []}
    )
    with pytest.raises(ProviderError, match="plan"):
        af.fixtures(DAY, 2026, sleep=lambda _s: None)


# ---------- T-142 odds ----------


def test_american_to_decimal() -> None:
    assert american_to_decimal("-126") == pytest.approx(1.0 + 100 / 126)
    assert american_to_decimal("+272") == pytest.approx(3.72)
    assert american_to_decimal("+100") == pytest.approx(2.0)


def sgo_payload(starts_at: str) -> dict[str, Any]:
    return {
        "data": [
            {
                "eventID": "ev1",
                "status": {"startsAt": starts_at},
                "teams": {
                    "home": {"names": {"long": "CF Montreal"}},
                    "away": {"names": {"long": "Toronto FC"}},
                },
                "odds": {
                    ODD_IDS["home"]: {"bookOdds": "-126"},
                    ODD_IDS["draw"]: {"bookOdds": "+272"},
                    ODD_IDS["away"]: {"bookOdds": "+280"},
                },
            }
        ]
    }


def test_capture_window_filters_and_converts() -> None:
    now = datetime(2026, 7, 18, 20, 30, tzinfo=UTC)
    inside = (now + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    sgo = SportsGameOddsAdapter("k", transport=lambda url, h: sgo_payload(inside))
    caps = sgo.captures(now, sleep=lambda _s: None)
    assert len(caps) == 1
    assert caps[0].odds_home == pytest.approx(1.0 + 100 / 126)
    outside = (now + timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    sgo2 = SportsGameOddsAdapter("k", transport=lambda url, h: sgo_payload(outside))
    assert sgo2.captures(now, sleep=lambda _s: None) == []
    assert (timedelta(hours=2), timedelta(hours=4)) == CAPTURE_WINDOW


def test_incomplete_three_way_market_skipped() -> None:
    now = datetime(2026, 7, 18, 20, 30, tzinfo=UTC)
    inside = (now + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    payload = sgo_payload(inside)
    del payload["data"][0]["odds"][ODD_IDS["draw"]]  # no draw price → not a 3-way market
    sgo = SportsGameOddsAdapter("k", transport=lambda url, h: payload)
    assert sgo.captures(now, sleep=lambda _s: None) == []


# ---------- integration: revision-bump ingestion ----------

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config
    from ingestion.live import ingest_live_fixtures
    from ingestion.odds import OddsCapture, ingest_odds_captures

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
        montreal = one("INSERT INTO team (canonical_name) VALUES ('CF Montreal') RETURNING team_id")
        toronto = one("INSERT INTO team (canonical_name) VALUES ('Toronto FC') RETURNING team_id")
        for team, key in ((montreal, "111"), (toronto, "222")):
            conn.execute(
                "INSERT INTO team_alias (provider, provider_key, team_id)"
                " VALUES ('highlightly',%s,%s)",
                (key, team),
            )
        yield {"conn": conn, "season": season}
        conn.close()

    @pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")
    def test_ingest_creates_then_revises_never_duplicates(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        ko = datetime(2026, 7, 18, 23, 30, tzinfo=UTC)
        fx = LiveFixture(
            provider="highlightly",
            provider_fixture_id="777",
            kickoff_utc=ko,
            status="scheduled",
            home_key="111",
            away_key="222",
            home_goals=None,
            away_goals=None,
            provider_last_updated_utc=None,
        )
        s1 = ingest_live_fixtures(conn, [fx], env["season"], 2026)
        assert s1 == {"new": 1, "revisions": 0, "unchanged": 0, "results": 0}
        s2 = ingest_live_fixtures(conn, [fx], env["season"], 2026)  # identical payload
        assert s2["unchanged"] == 1
        # postponement: kickoff moves +2 days → revision 1, same match identity
        from dataclasses import replace

        moved = replace(fx, kickoff_utc=ko + timedelta(days=2), status="postponed")
        s3 = ingest_live_fixtures(conn, [moved], env["season"], 2026)
        assert s3["revisions"] == 1
        n_matches = conn.execute("SELECT count(*) FROM match").fetchone()
        n_revs = conn.execute(
            "SELECT count(*) FROM source_fixture WHERE provider_fixture_id='777'"
        ).fetchone()
        assert n_matches is not None and int(n_matches[0]) == 1  # ONE match identity
        assert n_revs is not None and int(n_revs[0]) == 2  # two revisions
        # final result flows onto the match (live wins for the current season)
        finished = replace(moved, status="final", home_goals=2, away_goals=1)
        s4 = ingest_live_fixtures(conn, [finished], env["season"], 2026)
        assert s4["results"] == 1
        row = conn.execute("SELECT result, status FROM match LIMIT 1").fetchone()
        assert row is not None and row[0] == "H" and row[1] == "final"

    @pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")
    def test_odds_capture_resolves_by_name_and_dedupes(env) -> None:  # type: ignore[no-untyped-def]
        conn = env["conn"]
        now = datetime(2026, 7, 20, 20, 30, tzinfo=UTC)
        cap = OddsCapture(
            provider_event_id="ev1",
            kickoff_utc=datetime(2026, 7, 20, 23, 30, tzinfo=UTC),
            home_name="CF Montreal",
            away_name="Toronto FC",
            odds_home=1.79,
            odds_draw=3.72,
            odds_away=3.80,
        )
        stats = ingest_odds_captures(conn, [cap], now=now)
        assert stats == {"stored": 1, "unmatched": 0}
        stats2 = ingest_odds_captures(conn, [cap], now=now)  # same capture time → dedupe
        assert stats2["stored"] == 1  # insert attempted but ON CONFLICT keeps one row
        n = conn.execute(
            "SELECT count(*) FROM market_snapshot WHERE provider='sportsgameodds'"
        ).fetchone()
        assert n is not None and int(n[0]) == 1
        unknown = OddsCapture(
            provider_event_id="ev2",
            kickoff_utc=now + timedelta(hours=3),
            home_name="Nowhere FC",
            away_name="Nothing SC",
            odds_home=2.0,
            odds_draw=3.0,
            odds_away=4.0,
        )
        assert ingest_odds_captures(conn, [unknown], now=now)["unmatched"] == 1
