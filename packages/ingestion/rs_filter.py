"""T-032: regular-season filter — the R1 rule from spike E1 (docs/spikes/E1-playoffs.md).

Regular season iff file_date <= DecisionDay(season) + 1 day (the +1 absorbs the UK-local date
shift for US evening kickoffs), minus any per-season extra exclusion window (2020 MIB knockouts).

UNCONFIGURED SEASONS — the T-281 guard (2026-08-03). This function used to answer True for
EVERY date of a season with no configured Decision Day, on the reading that "the running
season excludes nothing". That is true early in a season and catastrophically false late in
one: with no 2026 entry, an October playoff fixture would have been stamped
`is_regular_season = true`, forecast, frozen, SHA-256 hashed, anchored to the public repo and
graded into the live record — all write-once, none of it retractable. Worse, `live.py` decides
the flag ONCE at INSERT (it returns early for an existing match), so adding the config
afterwards would not repair the rows; the damage lands ~7 days before the first playoff
kickoff, when the fixture first enters the +7d ingest window.

So the answer is now three-valued rather than two:
  · configured season                       -> the R1 rule, unchanged
  · unconfigured, before any Decision Day
    that has EVER been observed             -> True (safely regular season)
  · unconfigured, on/after that date        -> raise SeasonNotConfiguredError

The threshold is derived from the configured data (the earliest month/day in
decision_days.json), not hardcoded: if MLS ever moves Decision Day earlier, adding that season
tightens this guard automatically. It is deliberately conservative — it can refuse to classify
a fixture that really is regular season (2026 resumed ~Jul 16 after the World Cup, so its
Decision Day may well fall later than any prior year's). That direction is the safe one:
callers SKIP an unclassifiable fixture and report it (ADR-006), which is recoverable on the
next sweep once the config lands, whereas a wrongly-flagged anchored forecast is not.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import date, timedelta
from functools import lru_cache
from importlib import resources as importlib_resources


class SeasonNotConfiguredError(Exception):
    """A fixture falls in a season with no configured Decision Day, on a date late enough
    that it could be a playoff match. Refusing to classify is the point: guessing writes an
    unretractable row into a tamper-evident record."""

    def __init__(self, season_year: int, file_date: date, earliest_seen: date) -> None:
        self.season_year = season_year
        self.file_date = file_date
        super().__init__(
            f"season {season_year} has no Decision Day in decision_days.json and "
            f"{file_date.isoformat()} is on/after {earliest_seen.isoformat()}, the earliest "
            f"Decision Day ever observed — cannot tell regular season from playoffs. "
            f'Add "{season_year}" to packages/ingestion/resources/decision_days.json.'
        )


def _windows(raw: dict[str, list[list[str]]]) -> dict[int, tuple[tuple[date, date], ...]]:
    return {
        int(season): tuple((date.fromisoformat(a), date.fromisoformat(b)) for a, b in spans)
        for season, spans in raw.items()
        if not season.startswith("_")
    }


def _validate_days(days: dict[int, date]) -> None:
    """The guard fires on ABSENCE; it cannot catch a WRONG value. A Decision Day configured
    LATER than the truth silently stamps the first playoff round regular season while the
    canary stays quiet — the original hole, re-entered by typo. This catches the slice that is
    mechanically checkable: a season mapped to a date in a different year (a copy-paste of the
    wrong season). The dominant slip — a wrong DAY inside the right October — is NOT detectable
    in-repo; E1's 34-games-per-team invariant is the intended net there and does not apply to a
    season still in flight. Note the asymmetry: earlier-than-truth over-excludes and is safe;
    only later-than-truth is dangerous."""
    for season, day in days.items():
        if day.year != season:
            raise ValueError(
                f"decision_days.json: season {season} maps to {day.isoformat()}, whose year "
                f"is {day.year}. A Decision Day must fall in its own season."
            )


@lru_cache(maxsize=1)
def _config() -> tuple[
    dict[int, date],
    dict[int, tuple[tuple[date, date], ...]],
    dict[int, tuple[tuple[date, date], ...]],
]:
    ref = importlib_resources.files("ingestion").joinpath("resources/decision_days.json")
    raw = json.loads(ref.read_text(encoding="utf-8"))
    days = {int(season): date.fromisoformat(d) for season, d in raw["decision_day"].items()}
    _validate_days(days)
    return (
        days,
        _windows(raw.get("extra_exclusion_windows", {})),
        _windows(raw.get("neutral_site_windows", {})),
    )


def decision_day_for(season_year: int) -> date | None:
    """The configured Decision Day, or None if this season has no entry yet."""
    days, _, _ = _config()
    return days.get(season_year)


def _earliest_observed_dm() -> tuple[int, int]:
    """The earliest (month, day) across every configured Decision Day — the point in a year
    after which an unconfigured season can no longer be assumed to be regular season.
    Derived, not hardcoded, so the guard tightens on its own if MLS moves earlier."""
    days, _, _ = _config()
    return min((d.month, d.day) for d in days.values())


def guard_horizon(season_year: int) -> date:
    """The first date of `season_year` on which an unconfigured season becomes ambiguous."""
    month, day = _earliest_observed_dm()
    return date(season_year, month, day)


def is_ambiguous(season_year: int, file_date: date) -> bool:
    """True when this date cannot be classified without a configured Decision Day. Callers
    that must not raise (the canary, reporting) use this; ingest lets the exception fly."""
    return decision_day_for(season_year) is None and file_date >= guard_horizon(season_year)


def seasons_missing_decision_day(season_years: Iterable[int]) -> list[int]:
    """Which of the given seasons have no Decision Day configured. Used by the canary to warn
    BEFORE any fixture is refused — the config gap is knowable months ahead of the horizon."""
    days, _, _ = _config()
    return sorted(int(y) for y in season_years if int(y) not in days)


def is_regular_season(season_year: int, file_date: date) -> bool:
    """Raises SeasonNotConfiguredError for an unconfigured season at/after its guard horizon —
    see the module docstring for why refusing beats guessing here."""
    days, windows, _ = _config()
    decision_day = days.get(season_year)
    if decision_day is None:
        horizon = guard_horizon(season_year)
        if file_date >= horizon:
            raise SeasonNotConfiguredError(season_year, file_date, horizon)
    elif file_date > decision_day + timedelta(days=1):
        return False
    return all(not (start <= file_date <= end) for start, end in windows.get(season_year, ()))


def is_neutral_site(season_year: int, file_date: date) -> bool:
    """Known neutral-venue windows (2020 MLS-is-Back group stage)."""
    _, _, neutral = _config()
    return any(start <= file_date <= end for start, end in neutral.get(season_year, ()))
