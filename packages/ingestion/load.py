"""Historical load pipeline (T-030/T-031/T-032/T-040/T-041/T-050 assembled).

fetch -> snapshot+hash -> parse -> validate/quarantine -> seed aliases -> upsert league/seasons
-> insert matches (natural key, RS-tagged) + closing market snapshots -> reconciliation report.

Run: uv run python -m ingestion.load  (needs DATABASE_URL; local file fallback if offline)
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from importlib import resources as importlib_resources
from pathlib import Path

import psycopg
from common.config import load_settings

from ingestion import aliases as al
from ingestion import validate as vl
from ingestion.historical import RawSnapshot, fetch_usa_csv, record_dataset_snapshot
from ingestion.normalize import NormalizedMatch, parse_file
from ingestion.reconcile import ReconciliationReport
from ingestion.rs_filter import is_neutral_site, is_regular_season

SOURCE = "football-data"


def _season_end_dates() -> dict[int, str]:
    ref = importlib_resources.files("ingestion").joinpath("resources/decision_days.json")
    return {
        int(k): v for k, v in json.loads(ref.read_text(encoding="utf-8"))["decision_day"].items()
    }


def upsert_league_and_seasons(conn: psycopg.Connection, years: set[int]) -> dict[int, int]:
    conn.execute(
        "INSERT INTO league (code, name) VALUES ('MLS', 'Major League Soccer')"
        " ON CONFLICT (code) DO NOTHING"
    )
    row = conn.execute("SELECT league_id FROM league WHERE code = 'MLS'").fetchone()
    assert row is not None
    league_id = int(row[0])
    ends = _season_end_dates()
    out: dict[int, int] = {}
    for year in sorted(years):
        conn.execute(
            "INSERT INTO season (league_id, year, regular_season_end) VALUES (%s, %s, %s)"
            " ON CONFLICT (league_id, year) DO NOTHING",
            (league_id, year, ends.get(year)),
        )
        srow = conn.execute(
            "SELECT season_id FROM season WHERE league_id = %s AND year = %s", (league_id, year)
        ).fetchone()
        assert srow is not None
        out[year] = int(srow[0])
    return out


def insert_match(
    conn: psycopg.Connection,
    m: NormalizedMatch,
    season_id: int,
    teams: dict[str, int],
    report: ReconciliationReport,
) -> int | None:
    """Insert one match by natural key; on existing row, apply SoT rules + log conflicts.
    Returns match_id for new rows, None when the row already existed."""
    home = al.resolve_or_raise(teams, SOURCE, m.home_name)
    away = al.resolve_or_raise(teams, SOURCE, m.away_name)
    rs = is_regular_season(m.season_year, m.natural_key_date)
    neutral = is_neutral_site(m.season_year, m.natural_key_date)
    row = conn.execute(
        "INSERT INTO match (season_id, home_team_id, away_team_id, natural_key_date,"
        " kickoff_utc, kickoff_approx, status, is_regular_season, neutral_site,"
        " home_goals, away_goals, result) VALUES (%s,%s,%s,%s,%s,true,'final',%s,%s,%s,%s,%s)"
        " ON CONFLICT (season_id, natural_key_date, home_team_id, away_team_id)"
        "   WHERE natural_key_date IS NOT NULL DO NOTHING"
        " RETURNING match_id",
        (
            season_id,
            home,
            away,
            m.natural_key_date,
            m.kickoff_utc,
            rs,
            neutral,
            m.home_goals,
            m.away_goals,
            m.result,
        ),
    ).fetchone()
    if row is not None:
        report.inserted += 1
        return int(row[0])

    stored = conn.execute(
        "SELECT match_id, home_goals, away_goals, result FROM match"
        " WHERE season_id=%s AND natural_key_date=%s AND home_team_id=%s AND away_team_id=%s",
        (season_id, m.natural_key_date, home, away),
    ).fetchone()
    assert stored is not None
    match_id, hg, ag, res = int(stored[0]), stored[1], stored[2], stored[3]
    incoming = (m.home_goals, m.away_goals, m.result)
    if (hg, ag, res) != incoming:
        # prior complete seasons: football-data wins -> apply + bump result_version
        key = f"{m.season_year}:{m.natural_key_date}:{m.home_name}v{m.away_name}"
        report.record_conflict(key, "result", (hg, ag, res), incoming, applied=True)
        conn.execute(
            "UPDATE match SET home_goals=%s, away_goals=%s, result=%s,"
            " result_version = result_version + 1 WHERE match_id = %s",
            (m.home_goals, m.away_goals, m.result, match_id),
        )
    else:
        report.unchanged += 1
    return None


def insert_closing_odds(conn: psycopg.Connection, m: NormalizedMatch, match_id: int) -> int:
    n = 0
    for o in m.odds:
        conn.execute(
            "INSERT INTO market_snapshot (match_id, provider, capture_time_utc,"
            " odds_home, odds_draw, odds_away, is_closing)"
            " VALUES (%s,%s,%s,%s,%s,%s,true)"
            " ON CONFLICT (match_id, provider, capture_time_utc) DO NOTHING",
            (match_id, o.provider, m.kickoff_utc, o.home, o.draw, o.away),
        )
        n += 1
    return n


def load_historical(conn: psycopg.Connection, data_root: Path) -> ReconciliationReport:
    snap: RawSnapshot = fetch_usa_csv(data_root)
    rows, parse_rejects = parse_file(snap.path)
    record_dataset_snapshot(conn, snap, row_count=len(rows))

    batch_id = f"usa-csv-{snap.sha256[:12]}"
    for line, reason in parse_rejects:
        conn.execute(
            "INSERT INTO staging_rejects (source, reason, raw_ref, batch_id, created_at_utc)"
            " VALUES ('football-data', %s, %s, %s, now())",
            (f"parse error: {reason}", f"line {line}", batch_id),
        )
    valid, rejects = vl.partition(rows)
    vl.quarantine(conn, rejects, batch_id, total=len(rows) + len(parse_rejects))
    odds_issues = [(m.source_line, issue) for m in valid for issue in m.odds_issues]

    al.seed_teams_and_aliases(conn)
    teams = al.resolver(conn, SOURCE)
    seasons = upsert_league_and_seasons(conn, {m.season_year for m in valid})

    report = ReconciliationReport(source=SOURCE)
    odds_rows = 0
    for m in valid:
        match_id = insert_match(conn, m, seasons[m.season_year], teams, report)
        if match_id is not None:
            odds_rows += insert_closing_odds(conn, m, match_id)
    print(
        f"[load_historical] snapshot={snap.sha256[:12]} rows={len(rows)} valid={len(valid)} "
        f"rejects={len(rejects)} parse_rejects={len(parse_rejects)} "
        f"odds_issues={len(odds_issues)} | {report.summary()} | market_snapshots+={odds_rows} "
        f"| finished {datetime.now(UTC).isoformat(timespec='seconds')}"
    )
    for line, issue in odds_issues[:10]:
        print(f"  ODDS-ISSUE line {line}: {issue}")
    for c in report.conflicts[:20]:
        print(f"  CONFLICT {c.match_key} {c.field}: {c.stored} -> {c.incoming} [{c.resolution}]")
    return report


def main() -> int:
    settings = load_settings()
    data_root = Path("data/raw")
    with psycopg.connect(settings.database_url, autocommit=False) as conn:
        load_historical(conn, data_root)
        conn.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
