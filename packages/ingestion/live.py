"""T-140/T-141/T-143: live fixture adapters + provider-failure handling (E15).

Provider roles per the E2 spike (docs/spikes/E2-live-mls.md, adopted fallback):
- PRIMARY = Highlightly (league 216087) — serves the current season on the free tier.
- BACKUP = API-Football (league 253) — free plan covers seasons 2022-2024 ONLY, so as a
  current-season backup it is degraded: on primary failure the system falls to last-known DB
  data + freshness banner rather than a working failover (documented honestly; Contract §5).

Both adapters emit identical canonical `LiveFixture` rows. Ingestion into `source_fixture` is
revision-bumping: any change to (kickoff, status, goals) inserts revision N+1 for the same
provider fixture id — never a new match identity. Retries: 3 with 5s/25s/125s backoff.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import psycopg

from ingestion.aliases import resolve_or_raise, resolver
from ingestion.historical import RETRY_DELAYS_S
from ingestion.rs_filter import is_regular_season

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
HIGHLIGHTLY_LEAGUE_ID = 216087
API_FOOTBALL_LEAGUE_ID = 253

# provider status -> canonical match status
_STATUS_MAP = {
    "Not started": "scheduled",
    "First half": "in_play",
    "Second half": "in_play",
    "Half Time": "in_play",
    "Finished": "final",
    "Postponed": "postponed",
    "Cancelled": "cancelled",
    "Abandoned": "abandoned",
    # API-Football short codes
    "NS": "scheduled",
    "1H": "in_play",
    "HT": "in_play",
    "2H": "in_play",
    "ET": "in_play",
    "FT": "final",
    "AET": "final",
    "PEN": "final",
    "PST": "postponed",
    "CANC": "cancelled",
    "ABD": "abandoned",
}

Transport = Callable[[str, dict[str, str]], dict[str, Any]]


class ProviderError(RuntimeError):
    """The provider could not be reached / returned garbage after retries."""


@dataclass(frozen=True)
class LiveFixture:
    provider: str
    provider_fixture_id: str
    kickoff_utc: datetime
    status: str  # canonical
    home_key: str  # provider team id (stringified) — resolved via team_alias
    away_key: str
    home_goals: int | None
    away_goals: int | None
    provider_last_updated_utc: datetime | None
    raw_ref: str | None = None


def _http_json(url: str, headers: dict[str, str]) -> dict[str, Any]:
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "application/json", **headers}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())  # type: ignore[no-any-return]


def _with_retries(
    fetch: Callable[[], dict[str, Any]],
    *,
    retry_delays: Sequence[float] = RETRY_DELAYS_S,
    sleep: Callable[[float], object] = time.sleep,
) -> dict[str, Any]:
    last: Exception | None = None
    for attempt in range(len(retry_delays) + 1):
        try:
            return fetch()
        except Exception as exc:
            last = exc
            if attempt < len(retry_delays):
                sleep(retry_delays[attempt])
    raise ProviderError(str(last))


def _canonical_status(raw: str) -> str:
    if raw not in _STATUS_MAP:
        # surface the provider's real vocabulary (delays/suspensions/etc.) instead of
        # silently calling an unknown state "scheduled" — extend _STATUS_MAP as observed
        print(f"live-ingest: unmapped provider status {raw!r} -> 'scheduled'")
    return _STATUS_MAP.get(raw, "scheduled")


class HighlightlyAdapter:
    """T-140 (primary, per adopted E2 fallback)."""

    name = "highlightly"

    def __init__(self, api_key: str, transport: Transport = _http_json) -> None:
        self._key = api_key
        self._transport = transport

    def fixtures(self, day: date, season: int, **kw: Any) -> list[LiveFixture]:
        body = _with_retries(
            lambda: self._transport(
                f"https://soccer.highlightly.net/matches?leagueId={HIGHLIGHTLY_LEAGUE_ID}"
                f"&date={day.isoformat()}&season={season}&limit=100",
                {"x-rapidapi-key": self._key},
            ),
            **kw,
        )
        out = []
        for m in body.get("data", []):
            state = m.get("state") or {}
            score = (state.get("score") or {}).get("current") or ""
            hg, ag = _parse_score(score)
            out.append(
                LiveFixture(
                    provider=self.name,
                    provider_fixture_id=str(m["id"]),
                    kickoff_utc=_iso(m["date"]),
                    status=_canonical_status(str(state.get("description") or "Not started")),
                    home_key=str(m["homeTeam"]["id"]),
                    away_key=str(m["awayTeam"]["id"]),
                    home_goals=hg,
                    away_goals=ag,
                    provider_last_updated_utc=None,  # Highlightly has no per-fixture stamp
                )
            )
        return out


class ApiFootballAdapter:
    """T-141 (backup — free plan limited to seasons 2022-2024; see module doc)."""

    name = "api-football"

    def __init__(self, api_key: str, transport: Transport = _http_json) -> None:
        self._key = api_key
        self._transport = transport

    def fixtures(self, day: date, season: int, **kw: Any) -> list[LiveFixture]:
        body = _with_retries(
            lambda: self._transport(
                f"https://v3.football.api-sports.io/fixtures?league={API_FOOTBALL_LEAGUE_ID}"
                f"&season={season}&date={day.isoformat()}",
                {"x-apisports-key": self._key},
            ),
            **kw,
        )
        if body.get("errors"):
            raise ProviderError(f"api-football errors: {body['errors']}")
        out = []
        for f in body.get("response", []):
            fx, teams, goals = f["fixture"], f["teams"], f["goals"]
            out.append(
                LiveFixture(
                    provider=self.name,
                    provider_fixture_id=str(fx["id"]),
                    kickoff_utc=_iso(fx["date"]),
                    status=_canonical_status(str(fx["status"]["short"])),
                    home_key=str(teams["home"]["id"]),
                    away_key=str(teams["away"]["id"]),
                    home_goals=goals.get("home"),
                    away_goals=goals.get("away"),
                    provider_last_updated_utc=None,
                )
            )
        return out


def fetch_with_failover(
    adapters: Sequence[HighlightlyAdapter | ApiFootballAdapter],
    day: date,
    season: int,
    **kw: Any,
) -> list[LiveFixture] | None:
    """T-143: primary → backup → None (caller serves last-known DB data + freshness banner;
    the site never blocks; a missed cutoff is an honest 'no forecast issued')."""
    for adapter in adapters:
        try:
            return adapter.fixtures(day, season, **kw)
        except ProviderError:
            continue
    return None


def _parse_score(score: str) -> tuple[int | None, int | None]:
    try:
        left, right = score.split("-")
        return int(left.strip()), int(right.strip())
    except (ValueError, AttributeError):
        return None, None


def _iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)


# ---------------- ingestion into source_fixture / match ----------------


def _latest_revision(
    conn: psycopg.Connection, provider: str, pfid: str
) -> tuple[int, int | None, datetime | None, str | None, int | None, int | None] | None:
    row = conn.execute(
        "SELECT fixture_revision, match_id, kickoff_utc, status, home_goals, away_goals"
        " FROM source_fixture WHERE provider=%s AND provider_fixture_id=%s"
        " ORDER BY fixture_revision DESC LIMIT 1",
        (provider, pfid),
    ).fetchone()
    if row is None:
        return None
    return (
        int(row[0]),
        None if row[1] is None else int(row[1]),
        row[2],
        None if row[3] is None else str(row[3]),
        None if row[4] is None else int(row[4]),
        None if row[5] is None else int(row[5]),
    )


def _find_or_create_match(
    conn: psycopg.Connection,
    fx: LiveFixture,
    season_id: int,
    season_year: int,
    teams: dict[str, int],
) -> int:
    home = resolve_or_raise(teams, fx.provider, fx.home_key)
    away = resolve_or_raise(teams, fx.provider, fx.away_key)
    row = conn.execute(
        # ±30h (launch-review fix: ±3 days can merge a weather make-up scheduled adjacent
        # to an existing meeting of the same pair)
        "SELECT match_id FROM match WHERE season_id=%s AND home_team_id=%s AND away_team_id=%s"
        " AND kickoff_utc BETWEEN %s - interval '30 hours' AND %s + interval '30 hours'",
        (season_id, home, away, fx.kickoff_utc, fx.kickoff_utc),
    ).fetchone()
    if row is not None:
        return int(row[0])
    rs = is_regular_season(season_year, fx.kickoff_utc.date())
    created = conn.execute(
        "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc,"
        " kickoff_approx, status, is_regular_season) VALUES (%s,%s,%s,%s,false,%s,%s)"
        " RETURNING match_id",
        (season_id, home, away, fx.kickoff_utc, fx.status, rs),
    ).fetchone()
    assert created is not None
    return int(created[0])


def ingest_live_fixtures(
    conn: psycopg.Connection,
    fixtures: Sequence[LiveFixture],
    season_id: int,
    season_year: int,
    *,
    now: datetime | None = None,
    results_only: bool = False,
) -> dict[str, int]:
    """Upsert canonical rows: unchanged payload → no-op; changed → revision N+1 (same match).
    Finished fixtures set the match result (live provider wins for the current season).

    results_only (the hourly 01-06 UTC night sweeps, ADR-005) processes ONLY completed
    finals — result + status + the audit revision — and NEVER runs supersession/voids or
    kickoff updates. The night window overlaps live play, where a transient provider blip
    (kickoff-time wobble, momentary 'postponed') must not void a frozen official mid-game;
    voids/supersession remain the 08:00/20:00 full sweeps' job, which never coincide with
    MLS play. The narrowing is the whole safety argument — do not widen it casually."""
    now = now or datetime.now(UTC)
    stats = {"new": 0, "revisions": 0, "unchanged": 0, "results": 0, "voided": 0}
    for fx in fixtures:
        if results_only and not (
            fx.status == "final" and fx.home_goals is not None and fx.away_goals is not None
        ):
            stats["skipped_nonfinal"] = stats.get("skipped_nonfinal", 0) + 1
            continue
        teams = resolver(conn, fx.provider)
        latest = _latest_revision(conn, fx.provider, fx.provider_fixture_id)
        if latest is None:
            match_id = _find_or_create_match(conn, fx, season_id, season_year, teams)
            revision = 0
            stats["new"] += 1
        else:
            revision, match_id_opt, ko, status, hg, ag = latest
            match_id = (
                match_id_opt
                if match_id_opt is not None
                else _find_or_create_match(conn, fx, season_id, season_year, teams)
            )
            unchanged = (
                ko == fx.kickoff_utc
                and status == fx.status
                and hg == fx.home_goals
                and ag == fx.away_goals
            )
            if unchanged:
                stats["unchanged"] += 1
                continue
            revision += 1
            stats["revisions"] += 1
        conn.execute(
            "INSERT INTO source_fixture (provider, provider_fixture_id, fixture_revision,"
            " match_id, kickoff_utc, status, home_provider_key, away_provider_key,"
            " home_goals, away_goals, fetched_at_utc)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                fx.provider,
                fx.provider_fixture_id,
                revision,
                match_id,
                fx.kickoff_utc,
                fx.status,
                fx.home_key,
                fx.away_key,
                fx.home_goals,
                fx.away_goals,
                now,
            ),
        )
        if results_only:
            # finals only: write the status, never the kickoff (a provider's post-hoc
            # "actual kickoff" correction must not ripple into cutoffs/anchors), and
            # never void — see the docstring's safety argument
            conn.execute("UPDATE match SET status=%s WHERE match_id=%s", (fx.status, match_id))
        else:
            # Contract §7 supersession (launch-review fix — was never wired): a kickoff move
            # or a postpone/cancel/abandon AFTER an official freeze voids the old official;
            # the new T-3h forecast is then produced by fixtures_due/finalize automatically.
            prev = conn.execute(
                "SELECT kickoff_utc FROM match WHERE match_id=%s", (match_id,)
            ).fetchone()
            kickoff_moved = prev is not None and prev[0] is not None and prev[0] != fx.kickoff_utc
            if kickoff_moved or fx.status in ("postponed", "cancelled", "abandoned"):
                from models.ledger import latest_official, void_official

                official = latest_official(conn, match_id)
                if official is not None:
                    reason = "kickoff moved" if kickoff_moved else fx.status
                    void_official(conn, official, match_id, reason=reason)
                    stats["voided"] = stats.get("voided", 0) + 1
            # kickoff moves + status flow onto the canonical match (identity unchanged)
            conn.execute(
                "UPDATE match SET kickoff_utc=%s, status=%s WHERE match_id=%s",
                (fx.kickoff_utc, fx.status, match_id),
            )
        if fx.status == "final" and fx.home_goals is not None and fx.away_goals is not None:
            result = (
                "H"
                if fx.home_goals > fx.away_goals
                else "A"
                if fx.home_goals < fx.away_goals
                else "D"
            )
            conn.execute(
                "UPDATE match SET home_goals=%s, away_goals=%s, result=%s WHERE match_id=%s",
                (fx.home_goals, fx.away_goals, result, match_id),
            )
            stats["results"] += 1
    return stats
