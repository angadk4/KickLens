"""T-080: expanding walk-forward engine (Contract §6.5 / Protocol §3).

- Block = one **matchweek**, defined as (season_year, ISO week) of the UTC kickoff — the
  schedule's natural rhythm; documented proxy consistent with spike E6.
- Expanding: fold k trains on every dev match strictly before its block's first kickoff.
- Dev = 2017-2024 with **2017 as burn-in (training only)**; evaluated blocks start at the 2018
  season (Protocol §3: "2018-2024 dev walk-forward; 2025 sealed").
- Everything downstream (standardization, calibration, model fits) is refit per fold on
  `fold.train` only; the calibration slice is the trailing 20% of the training window and the
  R7 past-only assertion is enforced here.

The 2025 season must NEVER pass through this module until selection is frozen (touch-once).
`load_dev_samples` hard-caps at 2024.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import psycopg

DEV_FIRST_SEASON = 2017
DEV_LAST_SEASON = 2024  # hard cap: 2025 is the sealed touch-once test
FIRST_EVAL_SEASON = 2018
CALIBRATION_SLICE_FRACTION = 0.2
CALIBRATION_MIN_MATCHES = 150
CALIBRATION_MIN_DRAWS = 30


@dataclass(frozen=True)
class Sample:
    match_id: int
    season_year: int
    kickoff_utc: datetime
    week: tuple[int, int]  # (iso_year, iso_week) — the matchweek block key
    features: dict[str, float]
    outcome: str  # 'H' | 'D' | 'A'
    home_team_id: int
    away_team_id: int
    home_goals: int
    away_goals: int


@dataclass(frozen=True)
class Fold:
    block_key: tuple[int, int]
    train: tuple[Sample, ...]  # strictly before the block's first kickoff
    block: tuple[Sample, ...]

    @property
    def calibration_slice(self) -> tuple[Sample, ...]:
        """Trailing 20% of the training window (past-only; R7-asserted in make_folds)."""
        k = max(1, round(CALIBRATION_SLICE_FRACTION * len(self.train)))
        return self.train[-k:]

    @property
    def calibration_slice_sufficient(self) -> bool:
        sl = self.calibration_slice
        draws = sum(1 for s in sl if s.outcome == "D")
        return len(sl) >= CALIBRATION_MIN_MATCHES and draws >= CALIBRATION_MIN_DRAWS


def week_key(kickoff_utc: datetime) -> tuple[int, int]:
    iso = kickoff_utc.isocalendar()
    return (iso[0], iso[1])


def load_dev_samples(conn: psycopg.Connection) -> list[Sample]:
    """Regular-season dev-era samples with fs-v1 features. 2025+ is structurally excluded."""
    rows = conn.execute(
        "SELECT m.match_id, s.year, m.kickoff_utc, f.features, m.result,"
        " m.home_team_id, m.away_team_id, m.home_goals, m.away_goals"
        " FROM feature_row f JOIN match m USING (match_id) JOIN season s USING (season_id)"
        " WHERE f.feature_set_version = 'fs-v1' AND m.is_regular_season"
        "   AND m.result IS NOT NULL AND s.year BETWEEN %s AND %s"
        " ORDER BY m.kickoff_utc, m.match_id",
        (DEV_FIRST_SEASON, DEV_LAST_SEASON),
    ).fetchall()
    return [
        Sample(
            match_id=int(r[0]),
            season_year=int(r[1]),
            kickoff_utc=r[2],
            week=week_key(r[2]),
            features=r[3],
            outcome=str(r[4]),
            home_team_id=int(r[5]),
            away_team_id=int(r[6]),
            home_goals=int(r[7]),
            away_goals=int(r[8]),
        )
        for r in rows
    ]


def make_folds(samples: list[Sample], first_eval_season: int = FIRST_EVAL_SEASON) -> list[Fold]:
    """One fold per matchweek block from `first_eval_season` on; expanding training window."""
    ordered = sorted(samples, key=lambda s: (s.kickoff_utc, s.match_id))
    for s in ordered:
        if not (DEV_FIRST_SEASON <= s.season_year <= DEV_LAST_SEASON):
            raise AssertionError(f"non-dev season {s.season_year} reached the walk-forward")

    blocks: dict[tuple[int, int], list[Sample]] = {}
    for s in ordered:
        blocks.setdefault(s.week, []).append(s)

    folds: list[Fold] = []
    for key in sorted(blocks):
        block = blocks[key]
        if block[0].season_year < first_eval_season:
            continue  # burn-in: training-only seasons are never evaluated
        block_start = min(s.kickoff_utc for s in block)
        train = tuple(s for s in ordered if s.kickoff_utc < block_start)
        if not train:
            continue
        # R7: the calibration slice (and the whole training window) is strictly past-only
        if max(s.kickoff_utc for s in train) >= block_start:
            raise AssertionError("training window leaks into the evaluation block")
        folds.append(Fold(block_key=key, train=train, block=tuple(block)))
    return folds
