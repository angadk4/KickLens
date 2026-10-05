"""The historical loader must recognise a match the live ingest already created.

2026-10-04 incident (docs/incidents/2026-10-duplicate-live-matches.md): live.py creates
current-season rows without a natural_key_date, and load.py deduplicated ONLY through the
partial unique index on natural_key_date, so every monthly retrain re-inserted each live
match as a second row. 185 twins, each live result counted twice by Elo and the form
features. These tests pin the fix: the loader finds the live row by the rule live.py uses
(same pair, kickoff within ±30h) and leaves it alone. Needs DATABASE_URL (throwaway DB).
"""

import os
from datetime import UTC, date, datetime, timedelta

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config
    from ingestion import aliases as al
    from ingestion.live import LiveFixture, ingest_live_fixtures
    from ingestion.load import SOURCE, insert_match
    from ingestion.normalize import NormalizedMatch
    from ingestion.reconcile import ReconciliationReport

    @pytest.fixture(scope="module")
    def env():  # type: ignore[no-untyped-def]
        assert DATABASE_URL is not None
        cfg = Config("alembic.ini")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        conn = psycopg.connect(DATABASE_URL, autocommit=True)

        def one(sql: str, args: tuple[object, ...] = ()) -> int:
            row = (conn.execute(sql, args) if args else conn.execute(sql)).fetchone()
            assert row is not None
            return int(row[0])

        league = one("INSERT INTO league (code,name) VALUES ('MLS','MLS') RETURNING league_id")
        season = one(
            "INSERT INTO season (league_id, year) VALUES (%s, 2026) RETURNING season_id",
            (league,),
        )
        h = one("INSERT INTO team (canonical_name) VALUES ('H FC') RETURNING team_id")
        a = one("INSERT INTO team (canonical_name) VALUES ('A FC') RETURNING team_id")
        # the same two clubs under BOTH providers' keys, exactly as production maps them
        for provider, hk, ak in (("highlightly", "111", "222"), (SOURCE, "H FC", "A FC")):
            for team, key in ((h, hk), (a, ak)):
                conn.execute(
                    "INSERT INTO team_alias (provider, provider_key, team_id) VALUES (%s,%s,%s)",
                    (provider, key, team),
                )
        yield {"conn": conn, "season": season, "h": h, "a": a}
        conn.close()

    def _live(pfid: str, ko: datetime, goals: tuple[int, int] | None) -> "LiveFixture":
        return LiveFixture(
            provider="highlightly",
            provider_fixture_id=pfid,
            kickoff_utc=ko,
            status="final" if goals else "scheduled",
            home_key="111",
            away_key="222",
            home_goals=goals[0] if goals else None,
            away_goals=goals[1] if goals else None,
            provider_last_updated_utc=None,
        )

    def _file(ko: datetime, hg: int, ag: int) -> "NormalizedMatch":
        # the CSV's identity date is UK-local: a 23:30 UTC kickoff is already the next day
        return NormalizedMatch(
            season_year=2026,
            natural_key_date=(ko + timedelta(hours=1)).date(),
            kickoff_utc=ko,
            home_name="H FC",
            away_name="A FC",
            home_goals=hg,
            away_goals=ag,
            result="H" if hg > ag else "A" if hg < ag else "D",
            odds=(),
            source_line=1,
        )

    def _rows(conn: "psycopg.Connection", around: datetime) -> list[tuple[object, ...]]:
        return conn.execute(
            "SELECT match_id, natural_key_date, home_goals, away_goals, result, result_version"
            " FROM match WHERE kickoff_utc BETWEEN %s AND %s ORDER BY match_id",
            (around - timedelta(days=3), around + timedelta(days=3)),
        ).fetchall()

    def test_file_row_reuses_the_live_match_instead_of_duplicating(env) -> None:  # type: ignore[no-untyped-def]
        conn, ko = env["conn"], datetime(2026, 9, 30, 23, 30, tzinfo=UTC)
        ingest_live_fixtures(conn, [_live("9001", ko, (0, 3))], env["season"], 2026)
        teams = al.resolver(conn, SOURCE)
        report = ReconciliationReport(source=SOURCE)
        # the monthly retrain loads the same CSV again and again: it must stay one row
        for _ in range(2):
            assert insert_match(conn, _file(ko, 0, 3), env["season"], teams, report) is None
        rows = _rows(conn, ko)
        assert len(rows) == 1, f"live match duplicated: {rows}"
        assert rows[0][1] is None  # still the live-owned row, untouched
        assert (report.inserted, report.live_owned, report.conflicts) == (0, 2, [])

    def test_live_result_is_never_overwritten_by_the_file(env) -> None:  # type: ignore[no-untyped-def]
        conn, ko = env["conn"], datetime(2026, 9, 20, 23, 30, tzinfo=UTC)
        ingest_live_fixtures(conn, [_live("9002", ko, (0, 3))], env["season"], 2026)
        (before,) = _rows(conn, ko)
        report = ReconciliationReport(source=SOURCE)
        assert (
            insert_match(conn, _file(ko, 1, 3), env["season"], al.resolver(conn, SOURCE), report)
            is None
        )
        (row,) = _rows(conn, ko)
        # the live provider owns the current season: the score stands, and result_version
        # does not move — a bump would make grading regrade a forecast against the FILE's score
        assert (row[2], row[3], row[4]) == (0, 3, "A")
        assert row[5] == before[5]
        assert len(report.conflicts) == 1
        assert report.conflicts[0].resolution == "kept-stored"

    def test_live_row_awaiting_its_result_is_left_alone(env) -> None:  # type: ignore[no-untyped-def]
        """The CSV can carry a final before the live sweep records it. The live provider still
        owns that row: no write, and no conflict (there is no stored result to disagree with)."""
        conn, ko = env["conn"], datetime(2026, 9, 10, 23, 30, tzinfo=UTC)
        ingest_live_fixtures(conn, [_live("9003", ko, None)], env["season"], 2026)
        report = ReconciliationReport(source=SOURCE)
        assert (
            insert_match(conn, _file(ko, 2, 1), env["season"], al.resolver(conn, SOURCE), report)
            is None
        )
        (row,) = _rows(conn, ko)
        assert (row[2], row[4]) == (None, None)
        assert (report.live_owned, report.conflicts) == (1, [])

    def test_a_separate_meeting_outside_the_window_still_inserts(env) -> None:  # type: ignore[no-untyped-def]
        """The ±30h window must not swallow a genuinely different meeting of the same pair."""
        conn, ko = env["conn"], datetime(2026, 8, 20, 23, 30, tzinfo=UTC)
        ingest_live_fixtures(conn, [_live("9004", ko, (1, 1))], env["season"], 2026)
        report = ReconciliationReport(source=SOURCE)
        later = ko + timedelta(hours=31)
        new_id = insert_match(
            conn, _file(later, 2, 0), env["season"], al.resolver(conn, SOURCE), report
        )
        assert new_id is not None and report.inserted == 1 and report.live_owned == 0
        assert len(_rows(conn, ko)) == 2
        assert date(2026, 8, 22) == _rows(conn, ko)[1][1]  # the file row keeps its own identity
