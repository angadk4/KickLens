"""T-051: standing data-quality checks — run after any (re)load; suite lives in CI.

Checks: null rates on load-bearing columns, duplicate natural keys, alias coverage,
missing-matchweek detection (in-season gaps with no matches). Returns a report dict;
`violations()` lists the failures that should fail a build.
"""

from __future__ import annotations

from typing import Any

import psycopg

MAX_IN_SEASON_GAP_DAYS = 21  # longer in-season gaps flagged for review (breaks, data holes)
ERA = (2017, 2025)


def dq_report(conn: psycopg.Connection) -> dict[str, Any]:
    report: dict[str, Any] = {}

    row = conn.execute(
        "SELECT count(*),"
        " count(*) FILTER (WHERE kickoff_utc IS NULL),"
        " count(*) FILTER (WHERE result IS NULL AND status = 'final'),"
        " count(*) FILTER (WHERE natural_key_date IS NULL)"
        " FROM match"
    ).fetchone()
    assert row is not None
    total, null_kickoff, final_without_result, no_natural_key = (int(v) for v in row)
    report["matches"] = total
    report["null_kickoff"] = null_kickoff
    report["final_without_result"] = final_without_result
    report["live_only_rows"] = no_natural_key

    dup = conn.execute(
        "SELECT count(*) FROM (SELECT season_id, natural_key_date, home_team_id, away_team_id"
        " FROM match WHERE natural_key_date IS NOT NULL"
        " GROUP BY 1,2,3,4 HAVING count(*) > 1) d"
    ).fetchone()
    assert dup is not None
    report["duplicate_natural_keys"] = int(dup[0])

    uncovered = conn.execute(
        "SELECT count(*) FROM team t WHERE NOT EXISTS"
        " (SELECT 1 FROM team_alias a WHERE a.team_id = t.team_id"
        "  AND a.provider = 'football-data')"
    ).fetchone()
    assert uncovered is not None
    report["teams_without_football_data_alias"] = int(uncovered[0])

    era_rows = conn.execute(
        # DISTINCT match ids: the LEFT JOIN fans out one row per odds provider
        "SELECT s.year, count(DISTINCT m.match_id) FILTER (WHERE m.is_regular_season),"
        " count(DISTINCT ms.match_id) FILTER (WHERE ms.provider='pinnacle'"
        "   AND m.is_regular_season)"
        " FROM match m JOIN season s USING (season_id)"
        " LEFT JOIN market_snapshot ms ON ms.match_id = m.match_id AND ms.is_closing"
        " WHERE s.year BETWEEN %s AND %s GROUP BY s.year ORDER BY s.year",
        ERA,
    ).fetchall()
    report["era_rs_counts"] = {int(y): int(n) for y, n, _ in era_rows}
    report["era_pinnacle_closing"] = {int(y): int(p) for y, _, p in era_rows}

    gaps = conn.execute(
        "WITH rs AS (SELECT s.year, m.natural_key_date AS d FROM match m"
        "  JOIN season s USING (season_id)"
        "  WHERE m.is_regular_season AND m.natural_key_date IS NOT NULL)"
        " SELECT year, max(gap) FROM ("
        "  SELECT year, d - lag(d) OVER (PARTITION BY year ORDER BY d) AS gap FROM rs) g"
        " WHERE gap IS NOT NULL GROUP BY year ORDER BY year"
    ).fetchall()
    report["max_in_season_gap_days"] = {int(y): int(g) for y, g in gaps}
    report["seasons_with_large_gaps"] = sorted(
        int(y) for y, g in gaps if int(g) > MAX_IN_SEASON_GAP_DAYS
    )
    return report


def violations(report: dict[str, Any]) -> list[str]:
    """Hard failures (large gaps are review flags, not failures — e.g. COVID/World Cup breaks)."""
    out = []
    if report["duplicate_natural_keys"]:
        out.append(f"duplicate natural keys: {report['duplicate_natural_keys']}")
    if report["teams_without_football_data_alias"]:
        out.append(
            f"teams without football-data alias: {report['teams_without_football_data_alias']}"
        )
    if report["null_kickoff"]:
        out.append(f"matches with NULL kickoff: {report['null_kickoff']}")
    if report["final_without_result"]:
        out.append(f"final matches without result: {report['final_without_result']}")
    return out
