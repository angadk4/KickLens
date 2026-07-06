"""T-020 integration tests: core migration up/down + constraint enforcement.

Requires a local Postgres (make up) and DATABASE_URL; skipped otherwise.
"""

import os
from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set (integration test)")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config

    def _alembic_config() -> Config:
        cfg = Config("alembic.ini")
        return cfg

    @pytest.fixture(scope="module")
    def db() -> Iterator[psycopg.Connection]:
        cfg = _alembic_config()
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        assert DATABASE_URL is not None
        with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
            yield conn

    @pytest.fixture()
    def seeded(db: psycopg.Connection) -> Iterator[dict[str, int]]:
        """A league/season/two-teams scaffold; rows removed afterwards."""
        with db.transaction():
            league_id = db.execute(
                "INSERT INTO league (code, name) VALUES ('MLS','Major League Soccer')"
                " RETURNING league_id"
            ).fetchone()[0]  # type: ignore[index]
            season_id = db.execute(
                "INSERT INTO season (league_id, year, regular_season_end)"
                " VALUES (%s, 2024, %s) RETURNING season_id",
                (league_id, date(2024, 10, 19)),
            ).fetchone()[0]  # type: ignore[index]
            home_id = db.execute(
                "INSERT INTO team (canonical_name) VALUES ('Inter Miami') RETURNING team_id"
            ).fetchone()[0]  # type: ignore[index]
            away_id = db.execute(
                "INSERT INTO team (canonical_name) VALUES ('Atlanta United') RETURNING team_id"
            ).fetchone()[0]  # type: ignore[index]
        yield {
            "league": league_id,
            "season": season_id,
            "home": home_id,
            "away": away_id,
        }
        for table in (
            "market_snapshot",
            "feature_row",
            "elo_rating",
            "source_fixture",
            "match",
            "team_alias",
            "team",
            "season",
            "league",
        ):
            db.execute(f"DELETE FROM {table}")

    def test_migration_up_down_up_clean(db: psycopg.Connection) -> None:
        cfg = _alembic_config()
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        tables = {
            r[0]
            for r in db.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname='public'"
            ).fetchall()
        }
        assert {
            "league",
            "season",
            "team",
            "team_alias",
            "source_fixture",
            "match",
            "elo_rating",
            "feature_row",
            "market_snapshot",
        } <= tables

    def test_duplicate_source_fixture_rejected(
        db: psycopg.Connection, seeded: dict[str, int]
    ) -> None:
        now = datetime.now(UTC)
        db.execute(
            "INSERT INTO source_fixture (provider, provider_fixture_id, fixture_revision,"
            " fetched_at_utc) VALUES ('api-football','12345',0,%s)",
            (now,),
        )
        with pytest.raises(psycopg.errors.UniqueViolation):
            db.execute(
                "INSERT INTO source_fixture (provider, provider_fixture_id, fixture_revision,"
                " fetched_at_utc) VALUES ('api-football','12345',0,%s)",
                (now,),
            )

    def test_postponement_revision_does_not_duplicate_match(
        db: psycopg.Connection, seeded: dict[str, int]
    ) -> None:
        match_id = db.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, kickoff_utc)"
            " VALUES (%s,%s,%s,%s) RETURNING match_id",
            (
                seeded["season"],
                seeded["home"],
                seeded["away"],
                datetime(2026, 7, 18, 23, 30, tzinfo=UTC),
            ),
        ).fetchone()[0]  # type: ignore[index]
        # revision 0, then a postponement (new kickoff) as revision 1 → same match, no conflict
        for rev, kickoff in (
            (0, datetime(2026, 7, 18, 23, 30, tzinfo=UTC)),
            (1, datetime(2026, 7, 20, 0, 0, tzinfo=UTC)),
        ):
            db.execute(
                "INSERT INTO source_fixture (provider, provider_fixture_id, fixture_revision,"
                " match_id, kickoff_utc, fetched_at_utc) VALUES ('api-football','999',%s,%s,%s,%s)",
                (rev, match_id, kickoff, datetime.now(UTC)),
            )
        n = db.execute(
            "SELECT count(DISTINCT match_id) FROM source_fixture"
            " WHERE provider='api-football' AND provider_fixture_id='999'"
        ).fetchone()[0]  # type: ignore[index]
        assert n == 1  # one match identity across revisions

    def test_historical_natural_key_unique(db: psycopg.Connection, seeded: dict[str, int]) -> None:
        args = (seeded["season"], seeded["home"], seeded["away"], date(2024, 5, 4))
        db.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, natural_key_date)"
            " VALUES (%s,%s,%s,%s)",
            args,
        )
        with pytest.raises(psycopg.errors.UniqueViolation):
            db.execute(
                "INSERT INTO match (season_id, home_team_id, away_team_id, natural_key_date)"
                " VALUES (%s,%s,%s,%s)",
                args,
            )

    def test_market_snapshot_unique_and_odds_check(
        db: psycopg.Connection, seeded: dict[str, int]
    ) -> None:
        match_id = db.execute(
            "INSERT INTO match (season_id, home_team_id, away_team_id, natural_key_date)"
            " VALUES (%s,%s,%s,%s) RETURNING match_id",
            (seeded["season"], seeded["home"], seeded["away"], date(2024, 6, 1)),
        ).fetchone()[0]  # type: ignore[index]
        capture = datetime(2024, 6, 1, 20, 0, tzinfo=UTC)
        db.execute(
            "INSERT INTO market_snapshot (match_id, provider, capture_time_utc, odds_home,"
            " odds_draw, odds_away) VALUES (%s,'pinnacle',%s, 2.05, 3.4, 3.6)",
            (match_id, capture),
        )
        with pytest.raises(psycopg.errors.UniqueViolation):
            db.execute(
                "INSERT INTO market_snapshot (match_id, provider, capture_time_utc, odds_home,"
                " odds_draw, odds_away) VALUES (%s,'pinnacle',%s, 2.06, 3.4, 3.6)",
                (match_id, capture),
            )
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(
                "INSERT INTO market_snapshot (match_id, provider, capture_time_utc, odds_home,"
                " odds_draw, odds_away) VALUES (%s,'pinnacle',%s, 0.99, 3.4, 3.6)",
                (match_id, capture.replace(hour=21)),
            )

    def test_result_check_constraint(db: psycopg.Connection, seeded: dict[str, int]) -> None:
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute(
                "INSERT INTO match (season_id, home_team_id, away_team_id, result)"
                " VALUES (%s,%s,%s,'X')",
                (seeded["season"], seeded["home"], seeded["away"]),
            )
