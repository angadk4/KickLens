"""T-032: regular-season filter — the R1 rule from spike E1 (docs/spikes/E1-playoffs.md).

Regular season iff file_date <= DecisionDay(season) + 1 day (the +1 absorbs the UK-local date
shift for US evening kickoffs), minus any per-season extra exclusion window (2020 MIB knockouts).
Seasons without a configured Decision Day (e.g. the running season) exclude nothing.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from functools import lru_cache
from importlib import resources as importlib_resources


def _windows(raw: dict[str, list[list[str]]]) -> dict[int, tuple[tuple[date, date], ...]]:
    return {
        int(season): tuple((date.fromisoformat(a), date.fromisoformat(b)) for a, b in spans)
        for season, spans in raw.items()
        if not season.startswith("_")
    }


@lru_cache(maxsize=1)
def _config() -> tuple[
    dict[int, date],
    dict[int, tuple[tuple[date, date], ...]],
    dict[int, tuple[tuple[date, date], ...]],
]:
    ref = importlib_resources.files("ingestion").joinpath("resources/decision_days.json")
    raw = json.loads(ref.read_text(encoding="utf-8"))
    days = {int(season): date.fromisoformat(d) for season, d in raw["decision_day"].items()}
    return (
        days,
        _windows(raw.get("extra_exclusion_windows", {})),
        _windows(raw.get("neutral_site_windows", {})),
    )


def is_regular_season(season_year: int, file_date: date) -> bool:
    days, windows, _ = _config()
    decision_day = days.get(season_year)
    if decision_day is not None and file_date > decision_day + timedelta(days=1):
        return False
    return all(not (start <= file_date <= end) for start, end in windows.get(season_year, ()))


def is_neutral_site(season_year: int, file_date: date) -> bool:
    """Known neutral-venue windows (2020 MLS-is-Back group stage)."""
    _, _, neutral = _config()
    return any(start <= file_date <= end for start, end in neutral.get(season_year, ()))
