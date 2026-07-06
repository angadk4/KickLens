"""M1 integration tests: full historical load against the local DB (real USA.csv).

Needs DATABASE_URL + `make up` + data/raw/USA.csv (any recent copy; the loader uses the
network with a cache fallback). Skipped otherwise.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
DATA_ROOT = Path("data/raw")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set (integration test)")

# real per-season regular-season counts established by spike E6
E6_RS_COUNTS = {
    2017: 374,
    2018: 391,
    2019: 408,
    2020: 292,
    2021: 459,
    2022: 476,
    2023: 493,
    2024: 493,
    2025: 510,
}

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config
    from ingestion.dq import dq_report, violations
    from ingestion.load import load_historical

    @pytest.fixture(scope="module")
    def loaded() -> Iterator[psycopg.Connection]:
        cfg = Config("alembic.ini")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        assert DATABASE_URL is not None
        with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
            load_historical(conn, DATA_ROOT)
            conn.commit()
            yield conn

    def test_era_regular_season_counts_match_e6(loaded: psycopg.Connection) -> None:
        rows = loaded.execute(
            "SELECT s.year, count(*) FROM match m JOIN season s USING (season_id)"
            " WHERE m.is_regular_season AND s.year BETWEEN 2017 AND 2025"
            " GROUP BY s.year ORDER BY s.year"
        ).fetchall()
        assert {int(y): int(n) for y, n in rows} == E6_RS_COUNTS

    def test_closing_odds_attached(loaded: psycopg.Connection) -> None:
        row = loaded.execute(
            "SELECT count(*) FROM match m JOIN season s USING (season_id)"
            " WHERE s.year BETWEEN 2017 AND 2025 AND m.is_regular_season"
            "   AND EXISTS (SELECT 1 FROM market_snapshot ms WHERE ms.match_id = m.match_id"
            "               AND ms.provider = 'pinnacle' AND ms.is_closing)"
        ).fetchone()
        assert row is not None
        assert (
            int(row[0]) == sum(E6_RS_COUNTS.values()) - 1
        )  # T-004: exactly one era match lacks PSC*

    def test_rerun_is_idempotent(loaded: psycopg.Connection) -> None:
        before = loaded.execute("SELECT count(*) FROM match").fetchone()
        report = load_historical(loaded, DATA_ROOT)
        loaded.commit()
        after = loaded.execute("SELECT count(*) FROM match").fetchone()
        assert before == after
        assert report.inserted == 0 and not report.conflicts

    def test_alias_coverage_complete(loaded: psycopg.Connection) -> None:
        row = loaded.execute(
            "SELECT count(*) FROM team t WHERE NOT EXISTS (SELECT 1 FROM team_alias a"
            " WHERE a.team_id = t.team_id AND a.provider = 'football-data')"
        ).fetchone()
        assert row is not None and int(row[0]) == 0

    def test_injected_result_conflict_is_logged_and_applied(
        loaded: psycopg.Connection,
    ) -> None:
        # T-041: tamper with one stored historical result, re-run, expect conflict log + fix
        loaded.execute(
            "UPDATE match SET home_goals = home_goals + 1, result = 'H'"
            " WHERE match_id = (SELECT match_id FROM match m JOIN season s USING (season_id)"
            "                   WHERE s.year = 2023 AND m.result = 'D'"
            "                   AND m.natural_key_date IS NOT NULL LIMIT 1)"
        )
        loaded.commit()
        report = load_historical(loaded, DATA_ROOT)
        loaded.commit()
        assert len(report.conflicts) == 1
        assert report.conflicts[0].resolution == "applied-incoming"
        # and the file's (source-of-truth) value was restored, with result_version bumped
        row = loaded.execute("SELECT count(*) FROM match WHERE result_version > 0").fetchone()
        assert row is not None and int(row[0]) == 1

    def test_dq_suite_clean(loaded: psycopg.Connection) -> None:
        report = dq_report(loaded)
        assert violations(report) == []
        assert report["era_rs_counts"] == E6_RS_COUNTS
        assert report["duplicate_natural_keys"] == 0
        # long in-season gaps exist only where reality has them: COVID 2020, the month-long
        # Leagues Cup pauses 2023/2024, and (once post-resumption rows land) the 2026 WC break
        assert set(report["seasons_with_large_gaps"]) <= {2020, 2023, 2024, 2026}
