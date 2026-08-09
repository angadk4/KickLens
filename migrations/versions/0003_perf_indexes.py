"""Read-path indexes for the API's hot queries.

Purely additive: ten CREATE INDEX statements and nothing else. No table is rewritten, no column
changes, no data is touched, and the write-once prediction ledger, its triggers and its hashes
are untouched. `downgrade()` drops exactly what `upgrade()` created.

WHY THIS MATTERS MORE HERE THAN ON ORDINARY POSTGRES. Neon scales to zero. When it wakes, its
Local File Cache is empty, so every heap page a query touches is a network fetch from the
pageserver rather than a memory read. A sequential scan that costs milliseconds warm costs
whole seconds cold. The production cold path was measured at 26.3s for /health alone
(BUILD_LOG 2026-07-13), against ~0.38s warm. These indexes turn the four/five full scans behind
that number into a handful of index page reads.

WHY PLAIN `CREATE INDEX`, NOT `CONCURRENTLY`. CREATE INDEX takes a SHARE lock: it blocks
writers, never readers. The API is read-only, so it cannot be affected at all, and at these
table sizes each build is sub-second. CONCURRENTLY cannot run inside a transaction, which would
force AUTOCOMMIT, break Alembic's atomicity, and on failure leave an INVALID index behind a
half-applied migration. That failure mode costs far more than the sub-second writer block it
avoids. Revisit if any of these tables passes ~1M rows.

The `lock_timeout` below is the safety measure that actually matters: if an ingest job happens
to be mid-transaction, CREATE INDEX queues for its SHARE lock — and every writer arriving behind
it queues too, turning a sub-second operation into a write outage. With the timeout the
migration simply aborts cleanly and you re-run it.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003_perf_indexes"
down_revision: str | None = "0002_audit_ops"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (name, table, definition) — definition is everything after ON <table>.
_INDEXES: list[tuple[str, str, str]] = [
    # The NOT EXISTS anti-join that keeps voided forecasts out of the published record. Six call
    # sites: /matches/upcoming, /matches/in-play, /matches/{id} (twice), /predictions/completed
    # (twice) and /matches/{id}/verification. Unindexed, every probe was a sequential scan; in
    # the completed-count it ran once per official prediction, i.e. O(n^2) as the ledger grows.
    ("ix_prediction_event_pred_type", "prediction_event", "(prediction_id, event_type)"),
    # /health subquery: newest completed ingest of any kind.
    ("ix_job_run_name_status_finished", "job_run", "(job_name, status, finished_at_utc)"),
    # /health subquery: newest FULL sweep. Partial, because the predicate is the expensive part
    # (a JSONB extraction evaluated per row over the whole table). coalesce, ->> and text = are
    # all IMMUTABLE, so this is a legal index predicate. The expression must stay TEXTUALLY
    # identical to the one in main.py or the planner's predicate prover will not match it.
    (
        "ix_job_run_full_sweep",
        "job_run",
        "(finished_at_utc) WHERE job_name = 'ingest' AND status = 'done'"
        " AND coalesce(details->>'sweep', 'full') = 'full'",
    ),
    # /health subquery: max(fetched_at_utc) over a table carrying full production history.
    ("ix_source_fixture_fetched", "source_fixture", "(fetched_at_utc)"),
    # /health subquery: max(graded_at_utc).
    ("ix_prediction_grade_graded_at", "prediction_grade", "(graded_at_utc)"),
    # /teams/ratings: its cache-key probe becomes an index-only scan, and the ~6k-row Elo replay
    # pull arrives already ordered, so the sort disappears.
    (
        "ix_match_rated_kickoff",
        "match",
        "(kickoff_utc, match_id) WHERE is_regular_season AND result IS NOT NULL",
    ),
    # The official-forecast LATERALs on /matches/upcoming, /matches/in-play and verification.
    # A bare index on is_official would be useless (a mostly-true boolean); the useful shape is
    # the composite partial.
    (
        "ix_prediction_official_match",
        "prediction",
        "(match_id, forecast_creation_utc) WHERE is_official",
    ),
    # /performance and /calibration both do WHERE scope = … ORDER BY as_of_utc DESC LIMIT 1.
    ("ix_metrics_snapshot_scope_asof", "metrics_snapshot", "(scope, as_of_utc DESC)"),
    # /activity: filters and sorts on the event clock.
    ("ix_prediction_event_time", "prediction_event", "(event_time_utc DESC)"),
    # /activity: the ingest job feed.
    (
        "ix_job_run_ingest_recent",
        "job_run",
        "(coalesce(finished_at_utc, started_at_utc) DESC) WHERE job_name = 'ingest'",
    ),
]


def upgrade() -> None:
    # See the module docstring: without this, a queued CREATE INDEX blocks every writer behind
    # it. Aborting and retrying is strictly better than a write outage.
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute("SET LOCAL statement_timeout = '120s'")
    for name, table, definition in _INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {definition}")


def downgrade() -> None:
    for name, _table, _definition in reversed(_INDEXES):
        op.execute(f"DROP INDEX IF EXISTS {name}")
