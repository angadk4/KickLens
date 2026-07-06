"""T-142: live three-way odds adapter — SportsGameOdds (E3 GO; BL-2).

Captures the consensus 3-way regulation market for fixtures whose kickoff falls inside the
frozen capture window [now+2h, now+4h] (Contract §9, hourly cadence → each fixture is captured
near its T-3h cutoff). Snapshots land in `market_snapshot` with `is_closing=false` and
`capture_time_utc = fetch time`. Raw prices are NEVER displayed (aggregate-only ToS rule);
storage is for the same-cutoff comparison.
"""

from __future__ import annotations

import json
import urllib.request
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg

from ingestion.live import UA, Transport, _iso, _with_retries

CAPTURE_WINDOW = (timedelta(hours=2), timedelta(hours=4))

ODD_IDS = {
    "home": "points-home-reg-ml3way-home",
    "draw": "points-all-reg-ml3way-draw",
    "away": "points-away-reg-ml3way-away",
}


def american_to_decimal(american: str | float) -> float:
    a = float(str(american).replace("+", ""))
    return 1.0 + (a / 100.0 if a > 0 else 100.0 / abs(a))


@dataclass(frozen=True)
class OddsCapture:
    provider_event_id: str
    kickoff_utc: datetime
    home_name: str
    away_name: str
    odds_home: float  # decimal
    odds_draw: float
    odds_away: float


def _sgo_http(url: str, headers: dict[str, str]) -> dict[str, Any]:
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "application/json", **headers}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())  # type: ignore[no-any-return]


class SportsGameOddsAdapter:
    name = "sportsgameodds"

    def __init__(self, api_key: str, transport: Transport = _sgo_http) -> None:
        self._key = api_key
        self._transport = transport

    def captures(self, now: datetime, **kw: Any) -> list[OddsCapture]:
        body = _with_retries(
            lambda: self._transport(
                "https://api.sportsgameodds.com/v2/events/?leagueID=MLS&oddsAvailable=true",
                {"X-Api-Key": self._key},
            ),
            **kw,
        )
        lo, hi = now + CAPTURE_WINDOW[0], now + CAPTURE_WINDOW[1]
        out = []
        for ev in body.get("data", []):
            kickoff = _iso(str((ev.get("status") or {}).get("startsAt")))
            if not (lo <= kickoff <= hi):
                continue
            odds = ev.get("odds") or {}
            prices = {}
            for side, odd_id in ODD_IDS.items():
                book = (odds.get(odd_id) or {}).get("bookOdds")
                if book is None:
                    break
                prices[side] = american_to_decimal(book)
            if len(prices) < 3:
                continue  # incomplete three-way market → skip (excluded from subset only)
            teams = ev.get("teams") or {}
            out.append(
                OddsCapture(
                    provider_event_id=str(ev.get("eventID")),
                    kickoff_utc=kickoff,
                    home_name=str(((teams.get("home") or {}).get("names") or {}).get("long", "")),
                    away_name=str(((teams.get("away") or {}).get("names") or {}).get("long", "")),
                    odds_home=prices["home"],
                    odds_draw=prices["draw"],
                    odds_away=prices["away"],
                )
            )
        return out


def _match_for_capture(conn: psycopg.Connection, cap: OddsCapture) -> int | None:
    """Resolve the capture to a canonical match: alias map first, then a kickoff-window match
    on normalized names (SGO names differ; unresolved captures are skipped + logged)."""
    row = conn.execute(
        "SELECT m.match_id FROM match m"
        " JOIN team h ON h.team_id = m.home_team_id JOIN team a ON a.team_id = m.away_team_id"
        " LEFT JOIN team_alias ha ON ha.team_id = h.team_id AND ha.provider = 'sportsgameodds'"
        " LEFT JOIN team_alias aa ON aa.team_id = a.team_id AND aa.provider = 'sportsgameodds'"
        " WHERE m.kickoff_utc BETWEEN %s - interval '2 hours' AND %s + interval '2 hours'"
        "   AND (ha.provider_key = %s OR lower(h.canonical_name) = lower(%s)"
        "        OR lower(%s) LIKE lower(h.canonical_name) || '%%')"
        "   AND (aa.provider_key = %s OR lower(a.canonical_name) = lower(%s)"
        "        OR lower(%s) LIKE lower(a.canonical_name) || '%%')",
        (
            cap.kickoff_utc,
            cap.kickoff_utc,
            cap.home_name,
            cap.home_name,
            cap.home_name,
            cap.away_name,
            cap.away_name,
            cap.away_name,
        ),
    ).fetchone()
    return None if row is None else int(row[0])


def ingest_odds_captures(
    conn: psycopg.Connection,
    captures: Sequence[OddsCapture],
    *,
    now: datetime | None = None,
) -> dict[str, int]:
    now = now or datetime.now(UTC)
    stats = {"stored": 0, "unmatched": 0}
    for cap in captures:
        match_id = _match_for_capture(conn, cap)
        if match_id is None:
            stats["unmatched"] += 1
            continue
        conn.execute(
            "INSERT INTO market_snapshot (match_id, provider, capture_time_utc,"
            " odds_home, odds_draw, odds_away, is_closing, raw_ref)"
            " VALUES (%s,'sportsgameodds',%s,%s,%s,%s,false,%s)"
            " ON CONFLICT (match_id, provider, capture_time_utc) DO NOTHING",
            (match_id, now, cap.odds_home, cap.odds_draw, cap.odds_away, cap.provider_event_id),
        )
        stats["stored"] += 1
    return stats
