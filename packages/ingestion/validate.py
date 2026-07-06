"""T-050: validation gates + quarantine.

Every normalized row passes plausibility gates before touching canonical tables; failures are
quarantined to `staging_rejects` with a reason (never silently dropped). A batch whose reject
rate exceeds 5% halts ingestion (Contract §9 quarantine alarm).
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import psycopg

from ingestion.normalize import NormalizedMatch

REJECT_RATE_LIMIT = 0.05
# Observed closing 3-way overrounds are 1.012-1.064 (spike T-004); band kept generous.
# Applies to coherent single-source prices only: 'market-max' is the best price per outcome
# across books, so its implied sum legitimately dips below 1 (a cross-book arb, not bad data).
OVERROUND_BAND = (1.0, 1.25)
OVERROUND_CHECKED_PROVIDERS = frozenset({"pinnacle", "market-avg"})


class RejectRateExceeded(RuntimeError):
    """>5% of a batch failed validation — halt + alarm, do not continue (Contract §9)."""


@dataclass(frozen=True)
class Reject:
    row: NormalizedMatch
    reason: str


def check(m: NormalizedMatch) -> str | None:
    """Return a row-level rejection reason, or None. Odds plausibility is NOT row-level —
    see screen_odds (Contract §5 missing-odds policy: bad odds drop the market data only)."""
    if m.home_goals < 0 or m.away_goals < 0:
        return "negative goals"
    expected = "H" if m.home_goals > m.away_goals else "A" if m.home_goals < m.away_goals else "D"
    if m.result != expected:
        return f"result {m.result} inconsistent with score {m.home_goals}-{m.away_goals}"
    if m.home_name == m.away_name:
        return "home == away"
    if not (2000 <= m.season_year <= 2100):
        return f"implausible season {m.season_year}"
    if m.natural_key_date.year not in (m.season_year, m.season_year + 1):
        return "date outside season year"
    return None


def screen_odds(m: NormalizedMatch) -> NormalizedMatch:
    """Strip implausible odds groups (recorded in odds_issues); the match row survives.
    Real-file cases: market-avg overrounds of 0.953 and 1.471 on otherwise-good matches."""
    kept, issues = [], list(m.odds_issues)
    for o in m.odds:
        if min(o.home, o.draw, o.away) <= 1.0:
            issues.append(f"{o.provider} odds <= 1: {o.home}/{o.draw}/{o.away}")
            continue
        if o.provider in OVERROUND_CHECKED_PROVIDERS:
            overround = 1 / o.home + 1 / o.draw + 1 / o.away
            if not (OVERROUND_BAND[0] < overround <= OVERROUND_BAND[1]):
                issues.append(f"{o.provider} overround {overround:.3f} outside {OVERROUND_BAND}")
                continue
        kept.append(o)
    if len(issues) == len(m.odds_issues):
        return m
    return replace(m, odds=tuple(kept), odds_issues=tuple(issues))


def partition(
    rows: list[NormalizedMatch],
) -> tuple[list[NormalizedMatch], list[Reject]]:
    """Split a batch into (valid, rejects); dedupe on the natural key inside the batch."""
    valid: list[NormalizedMatch] = []
    rejects: list[Reject] = []
    seen: set[tuple[int, str, str, str]] = set()
    for m in rows:
        m = screen_odds(m)
        reason = check(m)
        if reason is None:
            key = (m.season_year, m.natural_key_date.isoformat(), m.home_name, m.away_name)
            if key in seen:
                reason = "duplicate natural key in batch"
            else:
                seen.add(key)
        if reason is None:
            valid.append(m)
        else:
            rejects.append(Reject(m, reason))
    return valid, rejects


def quarantine(conn: psycopg.Connection, rejects: list[Reject], batch_id: str, total: int) -> None:
    """Persist rejects and enforce the 5% halt rule."""
    for r in rejects:
        conn.execute(
            "INSERT INTO staging_rejects (source, reason, raw_ref, batch_id, created_at_utc)"
            " VALUES ('football-data', %s, %s, %s, now())",
            (r.reason, f"line {r.row.source_line}", batch_id),
        )
    if total and len(rejects) / total > REJECT_RATE_LIMIT:
        raise RejectRateExceeded(
            f"batch {batch_id}: {len(rejects)}/{total} rows rejected "
            f"(> {REJECT_RATE_LIMIT:.0%}) — ingestion halted"
        )
