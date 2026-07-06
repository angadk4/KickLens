# common — config, db access, hashing, shared types

## `common.config` (T-012)

`load_settings()` → frozen typed `Settings`. Precedence: explicit overrides > process env >
`.env` file. Required keys fail fast naming the key only; secrets are masked in `repr`.
`KICKLENS_ENV=cloud` routes to SSM Parameter Store (stub until M8/T-220+).

## `common.db` (T-022)

- `connect(url)` — psycopg3 connection (autocommit by default).
- `Db(conn)` — thin typed wrapper whose `execute/fetch_one/fetch_all` run the **write-once app
  guard**: any UPDATE / DELETE / TRUNCATE targeting `prediction` or `prediction_event` raises
  `WriteOnceViolation` before reaching the server. Layers beneath it: DB triggers (migration
  0002) reject mutation from any client; production adds a DB role without UPDATE/DELETE grants
  on the ledger tables (provisioned at T-222).
- `advisory_lock(conn, name, wait=False)` — context manager over `pg_(try_)advisory_lock`, with a
  stable SHA-256-derived 64-bit key; the choreography mutex (e.g. one inference run per league).
- `claim_job(conn, job_name, idempotency_key)` / `finish_job(...)` — exactly-once work claims via
  `job_run.idempotency_key` (`ON CONFLICT DO NOTHING`); re-runs return `None` instead of
  duplicating work.

Tests: `tests/test_db_access.py` (guard is unit-tested without a DB; locks/idempotency are
integration tests against the compose Postgres), plus the schema-layer proofs in
`tests/test_schema_audit.py`.
