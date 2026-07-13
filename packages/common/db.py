"""Typed data-access layer (T-022).

Write-once enforcement is layered (Contract §7 / CLAUDE.md §2.2):
1. this module's app guard — statements that UPDATE/DELETE a protected table raise
   ``WriteOnceViolation`` before any SQL reaches the server;
2. DB triggers (`kicklens_forbid_mutation`, migration 0002) — reject mutation from ANY client;
3. production DB role without UPDATE/DELETE grants on the ledger tables (provisioned with the
   cloud environment at T-222; local dev runs as the compose superuser).

Also provides the choreography helpers frozen in Contract §8: Postgres advisory locks and
idempotency-key job claims.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import psycopg

__all__ = [
    "PROTECTED_TABLES",
    "Db",
    "WriteOnceViolation",
    "advisory_lock",
    "claim_job",
    "connect",
    "finish_job",
]

PROTECTED_TABLES = frozenset({"prediction", "prediction_event"})

_MUTATION_RE = re.compile(
    r"\b(update|delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?(?:public\.)?(\w+)",
    re.IGNORECASE,
)


class WriteOnceViolation(RuntimeError):
    """An attempt to mutate a write-once ledger table was blocked in the app layer."""


def _check_write_once(sql: str) -> None:
    for _, table in _MUTATION_RE.findall(sql):
        if table.lower() in PROTECTED_TABLES:
            raise WriteOnceViolation(
                f"refusing to mutate write-once table '{table}': the official forecast ledger "
                "is INSERT-only (Contract 7); append events / new rows instead"
            )


def connect(database_url: str, *, autocommit: bool = True) -> psycopg.Connection:
    return psycopg.connect(database_url, autocommit=autocommit)


class Db:
    """Thin typed wrapper around a psycopg connection with the write-once app guard."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def execute(self, sql: str, args: tuple[Any, ...] = ()) -> psycopg.Cursor:
        _check_write_once(sql)
        return self.conn.execute(sql, args)

    def fetch_one(self, sql: str, args: tuple[Any, ...] = ()) -> tuple[Any, ...] | None:
        _check_write_once(sql)
        return self.conn.execute(sql, args).fetchone()

    def fetch_all(self, sql: str, args: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        _check_write_once(sql)
        return self.conn.execute(sql, args).fetchall()


def _lock_key(name: str) -> int:
    """Stable signed-64-bit key for pg_advisory_lock from a human-readable name."""
    digest = hashlib.sha256(name.encode()).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


@contextmanager
def advisory_lock(conn: psycopg.Connection, name: str, *, wait: bool = False) -> Iterator[bool]:
    """Hold a session-level Postgres advisory lock named `name` for the block.

    With wait=False (default) yields False immediately if another session holds it;
    with wait=True blocks until acquired (always yields True).
    """
    key = _lock_key(name)
    if wait:
        conn.execute("SELECT pg_advisory_lock(%s)", (key,))
        acquired = True
    else:
        row = conn.execute("SELECT pg_try_advisory_lock(%s)", (key,)).fetchone()
        acquired = bool(row and row[0])
    try:
        yield acquired
    finally:
        if acquired:
            conn.execute("SELECT pg_advisory_unlock(%s)", (key,))


CLAIM_LEASE_MINUTES = 15


def claim_job(conn: psycopg.Connection, job_name: str, idempotency_key: str) -> int | None:
    """Claim a unit of work with LEASE semantics (launch-review fix: a crash between claim and
    completion must never poison the key forever).

    Returns job_run_id when the claim is won; None when the work is already DONE or another
    worker holds a live (non-expired) claim. A claim is reclaimable when its status is any
    failure state, or when it has sat in 'running' beyond the lease (crashed worker)."""
    row = conn.execute(
        "INSERT INTO job_run (job_name, idempotency_key, status, started_at_utc)"
        " VALUES (%s, %s, 'running', %s)"
        " ON CONFLICT (idempotency_key) DO UPDATE"
        "   SET status = 'running', started_at_utc = EXCLUDED.started_at_utc,"
        "       finished_at_utc = NULL"
        "   WHERE job_run.status <> 'done'"
        "     AND (job_run.status <> 'running'"
        "          OR job_run.started_at_utc < %s - make_interval(mins => %s))"
        " RETURNING job_run_id",
        (job_name, idempotency_key, datetime.now(UTC), datetime.now(UTC), CLAIM_LEASE_MINUTES),
    ).fetchone()
    return None if row is None else int(row[0])


def finish_job(conn: psycopg.Connection, job_run_id: int, status: str = "done") -> None:
    conn.execute(
        "UPDATE job_run SET status = %s, finished_at_utc = %s WHERE job_run_id = %s",
        (status, datetime.now(UTC), job_run_id),
    )
