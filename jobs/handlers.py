"""T-221: the ONE job container's Lambda entrypoints (Contract §8: multi-handler image).

Each Lambda function uses this same image with a different CMD:
  handlers.ingest    — fixtures/results via Highlightly (+failover), revision-bumping upserts
  handlers.feature   — fs-v1 rows for fixtures approaching T-3h without a row
  handlers.inference — finalize official forecasts for fixtures crossing T-3h
  handlers.grade     — grade finals + recompute the live metrics snapshot

All read config from SSM (KICKLENS_ENV=cloud), all are idempotent, all honor the choreography
gates (advisory locks / idempotency keys / freshness) inside the package functions they call.
`{"dry_run": true}` returns after import+config+DB ping — used for the T-006b cold-start
measurement without touching state.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any

_import_t0 = time.perf_counter()
import psycopg  # noqa: E402
from common.config import load_settings  # noqa: E402

IMPORT_SECONDS = round(time.perf_counter() - _import_t0, 3)


def _conn() -> psycopg.Connection:
    return psycopg.connect(load_settings(dotenv_path=None).database_url, autocommit=True)


def _dry(event: dict[str, Any]) -> dict[str, Any] | None:
    if not event.get("dry_run"):
        return None
    t0 = time.perf_counter()
    with _conn() as conn:
        conn.execute("SELECT 1")
    return {
        "statusCode": 200,
        "dry_run": True,
        "import_seconds": IMPORT_SECONDS,
        "db_roundtrip_seconds": round(time.perf_counter() - t0, 3),
    }


def ingest(event: dict[str, Any], context: Any) -> dict[str, Any]:
    if (d := _dry(event)) is not None:
        return d
    from ingestion.live import HighlightlyAdapter, fetch_with_failover, ingest_live_fixtures

    settings = load_settings(dotenv_path=None)
    assert settings.highlightly_key
    now = datetime.now(UTC)
    adapters = [HighlightlyAdapter(settings.highlightly_key)]
    totals: dict[str, int] = {}
    with _conn() as conn:
        row = conn.execute(
            "SELECT season_id, year FROM season JOIN league USING (league_id)"
            " WHERE code='MLS' ORDER BY year DESC LIMIT 1"
        ).fetchone()
        assert row is not None
        season_id, year = int(row[0]), int(row[1])
        # yesterday (late finals), today, +7d fixture horizon
        for offset in (-1, 0, 1, 2, 3, 4, 5, 6, 7):
            day = (now + timedelta(days=offset)).date()
            fixtures = fetch_with_failover(adapters, day, year)
            if fixtures is None:
                continue  # provider down → last-known data serves; freshness gate flags
            stats = ingest_live_fixtures(conn, fixtures, season_id, year, now=now)
            for k, v in stats.items():
                totals[k] = totals.get(k, 0) + v
    return {"statusCode": 200, "totals": totals}


def feature(event: dict[str, Any], context: Any) -> dict[str, Any]:
    if (d := _dry(event)) is not None:
        return d
    # features for due fixtures are (re)built inside finalize; this hourly job pre-warms
    # rows for fixtures inside the draft window so drafts stay fresh
    from models.inference import generate_draft

    now = datetime.now(UTC)
    refreshed = 0
    with _conn() as conn:
        rows = conn.execute(
            "SELECT match_id FROM match WHERE result IS NULL AND is_regular_season"
            "   AND kickoff_utc BETWEEN %s AND %s",
            (now, now + timedelta(days=7)),
        ).fetchall()
        for (match_id,) in rows:
            if generate_draft(conn, int(match_id), now):
                refreshed += 1
    return {"statusCode": 200, "drafts_refreshed": refreshed}


def inference(event: dict[str, Any], context: Any) -> dict[str, Any]:
    if (d := _dry(event)) is not None:
        return d
    from models.inference import finalize_fixture, fixtures_due

    now = datetime.now(UTC)
    finalized: list[int] = []
    with _conn() as conn:
        for match_id in fixtures_due(conn, now):
            pid = finalize_fixture(conn, match_id, now)
            if pid is not None:
                finalized.append(pid)
    return {"statusCode": 200, "official_forecasts": finalized}


def grade(event: dict[str, Any], context: Any) -> dict[str, Any]:
    if (d := _dry(event)) is not None:
        return d
    from models.aggregation import recompute_live_snapshot
    from models.grading import grade_all_pending

    with _conn() as conn:
        graded = grade_all_pending(conn)
        snapshot_id = recompute_live_snapshot(conn)
        merkle: str | None = None
        if event.get("daily_merkle"):  # the 12:00 UTC EventBridge rule sets this flag
            from common.hashing import commit_daily_root

            merkle = commit_daily_root(conn, (datetime.now(UTC) - timedelta(days=1)).date())
            commit_daily_root(conn, datetime.now(UTC).date())
    return {
        "statusCode": 200,
        "graded": graded,
        "metrics_snapshot_id": snapshot_id,
        "merkle_root_yesterday": merkle,
    }
