"""T-011 integration smoke test: the local Compose Postgres is reachable.

Skipped unless DATABASE_URL is set (e.g. from .env.example after `make up`).
"""

import os

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")


@pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set (integration test)")
def test_db_connection() -> None:
    import psycopg

    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        row = conn.execute("SELECT 1").fetchone()
    assert row == (1,)
