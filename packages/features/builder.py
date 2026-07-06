"""T-063: fs-v1 builder — read RS matches from the DB, emit feature_row records.

Run: uv run python -m features.builder  (needs DATABASE_URL and a loaded historical DB).
Idempotent: unique (match_id, feature_set_version, as_of_utc) + ON CONFLICT DO NOTHING.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime

import psycopg
from common.config import load_settings

from features.engine import FeatureRow, MatchInput, build_feature_rows


def read_rs_matches(conn: psycopg.Connection) -> list[MatchInput]:
    rows = conn.execute(
        "SELECT m.match_id, s.year, m.kickoff_utc, m.home_team_id, m.away_team_id,"
        " m.home_goals, m.away_goals, m.neutral_site"
        " FROM match m JOIN season s USING (season_id)"
        " WHERE m.is_regular_season AND m.result IS NOT NULL AND m.kickoff_utc IS NOT NULL"
        " ORDER BY m.kickoff_utc, m.match_id"
    ).fetchall()
    return [
        MatchInput(
            match_id=int(r[0]),
            season_year=int(r[1]),
            kickoff_utc=r[2],
            home_team_id=int(r[3]),
            away_team_id=int(r[4]),
            home_goals=int(r[5]),
            away_goals=int(r[6]),
            neutral_site=bool(r[7]),
        )
        for r in rows
    ]


def write_feature_rows(conn: psycopg.Connection, rows: list[FeatureRow]) -> int:
    inserted = 0
    now = datetime.now(UTC)
    for r in rows:
        cur = conn.execute(
            "INSERT INTO feature_row (match_id, feature_set_version, as_of_utc,"
            " computed_at_utc, features, inputs_hash) VALUES (%s,%s,%s,%s,%s,%s)"
            " ON CONFLICT (match_id, feature_set_version, as_of_utc) DO NOTHING"
            " RETURNING feature_row_id",
            (
                r.match_id,
                r.feature_set_version,
                r.as_of_utc,
                now,
                json.dumps(r.features),
                r.inputs_hash,
            ),
        )
        if cur.fetchone() is not None:
            inserted += 1
    return inserted


def main() -> int:
    settings = load_settings()
    with psycopg.connect(settings.database_url, autocommit=False) as conn:
        matches = read_rs_matches(conn)
        rows = build_feature_rows(matches)
        inserted = write_feature_rows(conn, rows)
        conn.commit()
        print(
            f"[fs-v1 builder] rs_matches={len(matches)} rows_built={len(rows)} "
            f"inserted={inserted} (existing skipped: {len(rows) - inserted})"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
