"""T-060: chronological Elo engine, exactly per Build Contract §6.1.

- Update after each completed **regular-season** match: R' = R + K·G·(S - E), K=20,
  E = 1/(1 + 10^(-((R_home + H) - R_away)/400)), **H = 60** (home advantage, home side only).
- MOV multiplier G = ln(|gd|+1) · 2.2/((Δelo)·0.001 + 2.2), with Δelo = (adjusted) winner
  rating - loser rating (H applied to the home side), so upsets move ratings more.
  **Literal consequence (flagged to the developer): draws ⇒ |gd|=0 ⇒ G=0 ⇒ no rating change.**
- Start of season: R ← 1500 + 0.75·(R - 1500); offseason otherwise carried; new team R₀ = 1500.
- The current match NEVER contributes to its own pre-match ratings (leakage rule).

The engine is deterministic and pure over an ordered match list; DB persistence is thin glue.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime

INIT_RATING = 1500.0
K = 20.0
HOME_ADV = 60.0
SEASON_REGRESS = 0.75


@dataclass(frozen=True)
class EloMatch:
    """The minimal chronological match record the engine consumes."""

    match_id: int
    season_year: int
    order_key: datetime  # kickoff_utc; ties broken by match_id
    match_date: date
    home_team_id: int
    away_team_id: int
    home_goals: int
    away_goals: int


@dataclass
class EloEngine:
    ratings: dict[int, float] = field(default_factory=dict)
    seasons: dict[int, int] = field(default_factory=dict)  # team -> last season seen

    def _rating(self, team_id: int, season_year: int) -> float:
        """Current rating with lazy start-of-season regression; new team = 1500."""
        r = self.ratings.get(team_id, INIT_RATING)
        last = self.seasons.get(team_id)
        if last is not None and season_year > last:
            r = INIT_RATING + SEASON_REGRESS * (r - INIT_RATING)
        return r

    def pre_match(self, m: EloMatch) -> tuple[float, float]:
        """Ratings as of just before this match (excludes the match itself)."""
        return self._rating(m.home_team_id, m.season_year), self._rating(
            m.away_team_id, m.season_year
        )

    @staticmethod
    def expected_home(r_home: float, r_away: float) -> float:
        return 1.0 / (1.0 + math.pow(10.0, -((r_home + HOME_ADV) - r_away) / 400.0))

    def update(self, m: EloMatch) -> tuple[float, float]:
        """Apply the match; returns (home_rating_after, away_rating_after)."""
        r_home, r_away = self.pre_match(m)
        e_home = self.expected_home(r_home, r_away)
        gd = m.home_goals - m.away_goals
        s_home = 1.0 if gd > 0 else 0.0 if gd < 0 else 0.5

        if gd == 0:
            g = 0.0  # frozen formula: ln(0+1) = 0 — draws do not move ratings (see module doc)
        else:
            adj_home, adj_away = r_home + HOME_ADV, r_away
            delta_winner = (adj_home - adj_away) if gd > 0 else (adj_away - adj_home)
            g = math.log(abs(gd) + 1) * 2.2 / (delta_winner * 0.001 + 2.2)

        change = K * g * (s_home - e_home)
        new_home, new_away = r_home + change, r_away - change
        self.ratings[m.home_team_id] = new_home
        self.ratings[m.away_team_id] = new_away
        self.seasons[m.home_team_id] = m.season_year
        self.seasons[m.away_team_id] = m.season_year
        return new_home, new_away


def run_chronologically(
    matches: list[EloMatch],
) -> list[tuple[EloMatch, float, float, float, float]]:
    """Process RS matches in (order_key, match_id) order.
    Returns [(match, pre_home, pre_away, post_home, post_away), ...] — deterministic."""
    engine = EloEngine()
    out: list[tuple[EloMatch, float, float, float, float]] = []
    for m in sorted(matches, key=lambda x: (x.order_key, x.match_id)):
        pre_h, pre_a = engine.pre_match(m)
        post_h, post_a = engine.update(m)
        out.append((m, pre_h, pre_a, post_h, post_a))
    return out
