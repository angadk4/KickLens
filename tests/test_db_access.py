"""T-022 tests: write-once app guard (unit) + advisory locks & idempotency (integration)."""

import os
from collections.abc import Iterator

import pytest
from common.db import Db, WriteOnceViolation, _check_write_once

DATABASE_URL = os.environ.get("DATABASE_URL")


# ---------- unit: the app guard needs no database ----------


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE prediction SET p_home = 0.9 WHERE prediction_id = 1",
        "update public.prediction set is_official = false",
        "DELETE FROM prediction WHERE prediction_id = 1",
        "delete from prediction_event where match_id = 2",
        "TRUNCATE prediction",
        "TRUNCATE TABLE prediction_event",
    ],
)
def test_guard_blocks_mutation_of_protected_tables(sql: str) -> None:
    with pytest.raises(WriteOnceViolation):
        _check_write_once(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO prediction (match_id) VALUES (1)",
        "SELECT * FROM prediction WHERE match_id = 1",
        "UPDATE draft_prediction SET p_home = 0.5",  # drafts are overwritable by design
        "UPDATE job_run SET status = 'done'",
        "DELETE FROM staging_rejects",
    ],
)
def test_guard_allows_inserts_reads_and_unprotected_tables(sql: str) -> None:
    _check_write_once(sql)  # must not raise


# ---------- integration: locks + idempotency against the local DB ----------

pytestmark_db = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL not set (integration test)"
)

if DATABASE_URL:
    import psycopg
    from common.db import advisory_lock, claim_job, connect, finish_job

    @pytest.fixture()
    def conns() -> Iterator[tuple[psycopg.Connection, psycopg.Connection]]:
        assert DATABASE_URL is not None
        with connect(DATABASE_URL) as a, connect(DATABASE_URL) as b:
            yield a, b
            b.execute("DELETE FROM job_run WHERE job_name = 't022-test'")

    @pytestmark_db
    def test_advisory_lock_mutual_exclusion(
        conns: tuple[psycopg.Connection, psycopg.Connection],
    ) -> None:
        a, b = conns
        with advisory_lock(a, "inference:MLS") as got_a:
            assert got_a is True
            with advisory_lock(b, "inference:MLS") as got_b:
                assert got_b is False  # second session cannot acquire
        with advisory_lock(b, "inference:MLS") as got_b_after:
            assert got_b_after is True  # released with the context

    @pytestmark_db
    def test_idempotency_key_claims_once(
        conns: tuple[psycopg.Connection, psycopg.Connection],
    ) -> None:
        a, b = conns
        job_id = claim_job(a, "t022-test", "match-42:cutoff-2026-07-18T20:30Z")
        assert job_id is not None
        assert claim_job(b, "t022-test", "match-42:cutoff-2026-07-18T20:30Z") is None
        finish_job(a, job_id)
        row = a.execute("SELECT status FROM job_run WHERE job_run_id = %s", (job_id,)).fetchone()
        assert row is not None and row[0] == "done"

    @pytestmark_db
    def test_db_wrapper_blocks_protected_update_before_sql_runs(
        conns: tuple[psycopg.Connection, psycopg.Connection],
    ) -> None:
        db = Db(conns[0])
        with pytest.raises(WriteOnceViolation):
            db.execute("UPDATE prediction SET p_home = 0.9")
        # The DB-trigger layer (bypassing this guard) is proven with a real seeded row in
        # tests/test_schema_audit.py::test_prediction_update_and_delete_forbidden.
