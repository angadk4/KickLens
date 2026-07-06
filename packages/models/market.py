"""T-110: historical closing-odds market benchmark (Contract §5 / Protocol RQ6).

Vig removal = proportional: p_i = (1/o_i) / sum_j (1/o_j). The market is a
**stronger-information reference** (closing odds see everything up to kickoff; the model is
frozen at T-3h) — the comparison is DESCRIPTIVE ONLY; no "beats the market" claims (RQ6).
Only derived/aggregate quantities are ever displayed (never raw odds — ToS + Contract).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import psycopg

Probs = tuple[float, float, float]

PRIMARY_PROVIDER = "pinnacle"
FALLBACK_PROVIDER = "market-avg"  # T-004: 1 era match (+ 2026 so far) lacks pinnacle


def devig_proportional(odds_home: float, odds_draw: float, odds_away: float) -> Probs:
    inv = (1.0 / odds_home, 1.0 / odds_draw, 1.0 / odds_away)
    s = sum(inv)
    return (inv[0] / s, inv[1] / s, inv[2] / s)


@dataclass(frozen=True)
class MarketProbs:
    match_id: int
    kickoff_utc: datetime
    provider: str
    probs: Probs
    outcome: str
    week: tuple[int, int]


def load_market_probs(
    conn: psycopg.Connection, first_season: int, last_season: int
) -> list[MarketProbs]:
    """De-vigged closing probabilities per match (primary provider, fallback where absent)."""
    rows = conn.execute(
        "SELECT m.match_id, m.kickoff_utc, ms.provider, ms.odds_home, ms.odds_draw,"
        " ms.odds_away, m.result"
        " FROM market_snapshot ms JOIN match m USING (match_id) JOIN season s USING (season_id)"
        " WHERE ms.is_closing AND m.is_regular_season AND m.result IS NOT NULL"
        "   AND s.year BETWEEN %s AND %s AND ms.provider IN (%s, %s)"
        " ORDER BY m.kickoff_utc, m.match_id",
        (first_season, last_season, PRIMARY_PROVIDER, FALLBACK_PROVIDER),
    ).fetchall()
    by_match: dict[int, MarketProbs] = {}
    for match_id, kickoff, provider, oh, od, oa, result in rows:
        mid = int(match_id)
        if mid in by_match and by_match[mid].provider == PRIMARY_PROVIDER:
            continue  # primary wins; fallback only fills gaps
        iso = kickoff.isocalendar()
        by_match[mid] = MarketProbs(
            match_id=mid,
            kickoff_utc=kickoff,
            provider=str(provider),
            probs=devig_proportional(float(oh), float(od), float(oa)),
            outcome=str(result),
            week=(iso[0], iso[1]),
        )
    return sorted(by_match.values(), key=lambda m: (m.kickoff_utc, m.match_id))
