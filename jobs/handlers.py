"""T-221: the ONE job container's Lambda entrypoints (Contract §8: multi-handler image).

Each Lambda function uses this same image with a different CMD:
  handlers.ingest    — fixtures/results via Highlightly (+failover), revision-bumping upserts
  handlers.feature   — fs-v1 rows for fixtures approaching T-3h without a row
  handlers.inference — finalize official forecasts for fixtures crossing T-3h
  handlers.grade     — grade finals + recompute the live metrics snapshot

All read config from SSM (KICKLENS_ENV=cloud), all are idempotent, all honor the choreography
gates (leased idempotency-key claims / freshness; session advisory locks are VOID behind
PgBouncer transaction pooling and are not used) inside the package functions they call.
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

# Canary /health probe (Contract §9): tolerate a COLD API Lambda + Neon (free-tier auto-suspend)
# wake — the canary is the first request each morning and the cold path can take ~25-30s. Retry
# through the wake so a cold start is a non-event; a genuine outage fails every attempt and still
# raises -> alarm. Warm calls return on attempt 1 in <1s. Tests monkeypatch the sleep to 0.
CANARY_HEALTH_ATTEMPTS = 3
CANARY_HEALTH_TIMEOUT_S = 40
CANARY_HEALTH_RETRY_SLEEP_S = 3.0


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
    from common.db import claim_job, finish_job
    from ingestion.live import HighlightlyAdapter, fetch_with_failover, ingest_live_fixtures

    settings = load_settings(dotenv_path=None)
    assert settings.highlightly_key
    now = datetime.now(UTC)
    adapters = [HighlightlyAdapter(settings.highlightly_key)]
    totals: dict[str, int] = {}
    failed_days: list[str] = []
    with _conn() as conn:
        # hour-bucket claim (launch-review fix): duplicate EventBridge deliveries no-op;
        # a crashed run reclaims after the lease expires
        job_id = claim_job(conn, "ingest", f"ingest:{now:%Y%m%dT%H}")
        if job_id is None:
            return {"statusCode": 200, "skipped": "hour already claimed (duplicate delivery)"}
        try:
            # season = calendar year (MLS); ensure the row exists so the loop survives the
            # season rollover unattended (launch-review fix)
            league = conn.execute("SELECT league_id FROM league WHERE code='MLS'").fetchone()
            assert league is not None
            conn.execute(
                "INSERT INTO season (league_id, year) VALUES (%s, %s)"
                " ON CONFLICT (league_id, year) DO NOTHING",
                (int(league[0]), now.year),
            )
            srow = conn.execute(
                "SELECT season_id FROM season WHERE league_id=%s AND year=%s",
                (int(league[0]), now.year),
            ).fetchone()
            assert srow is not None
            season_id, year = int(srow[0]), now.year
            # yesterday (late finals), today, +7d fixture horizon; short per-day retry ladder
            # so the whole sweep fits the 300s timeout even when every day fails
            for offset in (-1, 0, 1, 2, 3, 4, 5, 6, 7):
                day = (now + timedelta(days=offset)).date()
                fixtures = fetch_with_failover(adapters, day, year, retry_delays=(5.0, 25.0))
                if fixtures is None:
                    failed_days.append(day.isoformat())
                    continue  # provider down → last-known data serves; freshness gate flags
                stats = ingest_live_fixtures(conn, fixtures, season_id, year, now=now)
                for k, v in stats.items():
                    totals[k] = totals.get(k, 0) + v
            if len(failed_days) == 9:
                # a TOTAL provider outage must be visible: raising fires the Errors alarm
                # (launch-review fix — silent None-continue hid full outages forever)
                raise RuntimeError(f"ingest: provider down for ALL days: {failed_days}")
            finish_job(conn, job_id)
        except BaseException:
            finish_job(conn, job_id, status="failed")
            raise
    if failed_days:
        print(f"ingest: provider failures for days {failed_days}")
    return {"statusCode": 200, "totals": totals, "failed_days": failed_days}


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
    from models.inference import finalize_fixture, fixtures_due, retry_failed_anchors

    finalized: list[int] = []
    with _conn() as conn:
        # eventual publication (launch-review fix): re-push anchors whose GitHub push failed
        caught_up = retry_failed_anchors(conn)
        for match_id in fixtures_due(conn, datetime.now(UTC)):
            # fresh timestamp PER FIXTURE (launch-review fix): a long batch must not hash a
            # stale creation time or trip the post-kickoff rejection spuriously
            pid = finalize_fixture(conn, match_id, datetime.now(UTC))
            if pid is not None:
                finalized.append(pid)
    return {
        "statusCode": 200,
        "official_forecasts": finalized,
        "anchors_caught_up": caught_up,
    }


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
            # Launch-review fix: commit YESTERDAY only (a complete UTC day — committing
            # today's partial file would freeze a wrong root, since ON CONFLICT DO NOTHING
            # makes the first write final), and read the anchor lines from the PUBLIC repo:
            # the grade Lambda never shares a filesystem with inference, and the public file
            # is the authoritative anchor anyway.
            merkle = _commit_yesterday_merkle(conn)
    return {
        "statusCode": 200,
        "graded": graded,
        "metrics_snapshot_id": snapshot_id,
        "merkle_root_yesterday": merkle,
    }


def _commit_yesterday_merkle(conn: psycopg.Connection) -> str | None:
    """Fetch yesterday's anchor file from the public GitHub repo and commit its Merkle root.
    404 = no anchors that day (nothing to commit); other failures raise → Errors alarm."""
    import urllib.error
    import urllib.request

    from common.hashing import commit_daily_root_from_content

    settings = load_settings(dotenv_path=None)
    if not settings.github_anchor_repo:
        return None  # local dev without the anchor repo configured
    day = (datetime.now(UTC) - timedelta(days=1)).date()
    url = (
        f"https://raw.githubusercontent.com/{settings.github_anchor_repo}/main/"
        f"anchors/{day:%Y-%m-%d}.jsonl"
    )
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            content = resp.read().decode()
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    return commit_daily_root_from_content(conn, day, content)


def odds(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """T-142 schedule (Contract §9): hourly; capture the 3-way market for fixtures whose
    kickoff falls in [now+2h, now+4h] -> market_snapshot (is_closing=false). Aggregate-display
    rules live in the API layer; raw prices are stored for the same-cutoff comparison only."""
    if (d := _dry(event)) is not None:
        return d
    from ingestion.odds import SportsGameOddsAdapter, ingest_odds_captures

    settings = load_settings(dotenv_path=None)
    if not settings.sportsgameodds_key:
        return {"statusCode": 200, "skipped": "no SPORTSGAMEODDS_KEY configured"}
    now = datetime.now(UTC)
    captures = SportsGameOddsAdapter(settings.sportsgameodds_key).captures(now)
    with _conn() as conn:
        stats = ingest_odds_captures(conn, captures, now=now)
    return {"statusCode": 200, "captures": len(captures), **stats}


def canary(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Daily health canary (Contract §9): hits the PUBLIC /health endpoint and checks for
    overdue results (kicked off >24h ago, still not final). ANY failure raises -> the Lambda
    Errors alarm (threshold 1) emails the developer. Raising is the alerting mechanism."""
    import json as _json
    import os
    import time as _time
    import urllib.request

    api_url = os.environ.get("KICKLENS_API_URL", "")
    if not api_url:
        raise RuntimeError("canary: KICKLENS_API_URL not configured")
    # cold-tolerant probe: retry through an API/Neon cold wake; only raise if truly unreachable
    health: dict[str, Any] = {}
    last_exc: Exception | None = None
    for attempt in range(CANARY_HEALTH_ATTEMPTS):
        try:
            with urllib.request.urlopen(
                f"{api_url}/health", timeout=CANARY_HEALTH_TIMEOUT_S
            ) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"/health returned {resp.status}")
                health = _json.loads(resp.read())
            break
        except Exception as exc:
            last_exc = exc
            if attempt < CANARY_HEALTH_ATTEMPTS - 1:
                _time.sleep(CANARY_HEALTH_RETRY_SLEEP_S)
    else:
        raise RuntimeError(
            f"canary: /health unreachable after {CANARY_HEALTH_ATTEMPTS} attempts: {last_exc}"
        )
    problems: list[str] = []
    if not health.get("freshness_ok", False):
        problems.append(f"data stale: last_ingest={health.get('last_ingest')}")
    with _conn() as conn:
        overdue = conn.execute(
            "SELECT count(*) FROM match WHERE is_regular_season AND result IS NULL"
            "   AND kickoff_utc < now() - interval '24 hours'"
            "   AND kickoff_utc > now() - interval '60 days'"
            "   AND status NOT IN ('postponed', 'cancelled', 'abandoned')"
        ).fetchone()
        n_overdue = 0 if overdue is None else int(overdue[0])
        # dead-man check (launch-review fix): a future fixture whose T-3h cutoff passed
        # >90min ago with NO un-voided official forecast means the inference loop is silently
        # broken — the single worst failure this project can have
        missed = conn.execute(
            "SELECT count(*) FROM match m WHERE m.is_regular_season AND m.result IS NULL"
            "   AND m.status = 'scheduled' AND m.kickoff_utc > now()"
            "   AND m.kickoff_utc - interval '3 hours' < now() - interval '90 minutes'"
            "   AND NOT EXISTS (SELECT 1 FROM prediction p"
            "     WHERE p.match_id = m.match_id AND p.is_official"
            "       AND NOT EXISTS (SELECT 1 FROM prediction_event e"
            "         WHERE e.prediction_id = p.prediction_id AND e.event_type='Voided'))"
        ).fetchone()
        n_missed = 0 if missed is None else int(missed[0])
        # anchors stuck unpublished: latest anchor event is a push failure (the inference
        # job's catch-up should clear these within an hour; persistent = PAT/API problem)
        unpub = conn.execute(
            "SELECT count(*) FROM prediction p WHERE p.is_official AND ("
            "   SELECT e.event_type FROM prediction_event e"
            "   WHERE e.prediction_id = p.prediction_id"
            "     AND e.event_type IN ('AnchorPublished','AnchorPushFailed')"
            "   ORDER BY e.prediction_event_id DESC LIMIT 1) = 'AnchorPushFailed'"
        ).fetchone()
        n_unpub = 0 if unpub is None else int(unpub[0])
    if n_overdue:
        problems.append(f"{n_overdue} match(es) kicked off >24h ago without a final result")
    if n_missed:
        problems.append(f"{n_missed} fixture(s) past cutoff+90min with NO official forecast")
    if n_unpub:
        problems.append(f"{n_unpub} official forecast(s) with unpublished anchors")
    if problems:
        raise RuntimeError("canary FAILED: " + " | ".join(problems))
    return {
        "statusCode": 200,
        "health": health,
        "overdue_results": 0,
        "missed_forecasts": 0,
        "unpublished_anchors": 0,
    }
