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
measurement without touching state. `{"results_only": true}` (the hourly 01-06 UTC night
window) narrows the ingest sweep to yesterday+today so finals grade within ~1-2h.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from functools import wraps
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


def _observed(
    fn: Callable[[dict[str, Any], Any], dict[str, Any]],
) -> Callable[[dict[str, Any], Any], dict[str, Any]]:
    """Emit ONE structured line per run. EventBridge invokes these asynchronously and Lambda
    discards an async handler's return value, so without this a successful freeze / grade /
    ingest leaves no trace at all in CloudWatch — which is exactly why the 2026-07-23 ingest
    outage could not be scoped after the fact (only the failures were visible)."""

    @wraps(fn)
    def wrapper(event: dict[str, Any], context: Any) -> dict[str, Any]:
        result = fn(event, context)
        print(f"{fn.__name__}: {json.dumps(result, default=str)}")
        return result

    return wrapper


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


@_observed
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
    # fixtures skipped for an unmapped team (ADR-006) — persisted to job_run.details so the
    # daily canary keeps flagging them; a skip is never silent
    unresolved: list[str] = []
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
            # so the whole sweep fits the 300s timeout even when every day fails.
            # results_only (hourly 01-06 UTC night window, ADR-005) narrows to
            # yesterday+today — the only days carrying just-finished finals — at 2 provider
            # calls/run, processes finals only (no voids/kickoff updates: live.py), and
            # skips the HTTP retry ladder: the next hourly run IS the retry
            results_only = bool(event.get("results_only"))
            offsets: tuple[int, ...] = (-1, 0) if results_only else (-1, 0, 1, 2, 3, 4, 5, 6, 7)
            for offset in offsets:
                day = (now + timedelta(days=offset)).date()
                fixtures = fetch_with_failover(
                    adapters, day, year, retry_delays=() if results_only else (5.0, 25.0)
                )
                if fixtures is None:
                    failed_days.append(day.isoformat())
                    continue  # provider down → last-known data serves; freshness gate flags
                stats = ingest_live_fixtures(
                    conn,
                    fixtures,
                    season_id,
                    year,
                    now=now,
                    results_only=results_only,
                    unresolved_out=unresolved,
                )
                for k, v in stats.items():
                    totals[k] = totals.get(k, 0) + v
            if len(failed_days) == len(offsets):
                # a TOTAL provider outage must be visible: raising fires the Errors alarm
                # (launch-review fix — silent None-continue hid full outages forever)
                raise RuntimeError(f"ingest: provider down for ALL days: {failed_days}")
            # the sweep SUCCEEDED (freshness is honest) even if some fixtures were skipped —
            # the skips ride in details so the canary can surface them without paging hourly
            finish_job(
                conn,
                job_id,
                details={
                    # the sweep KIND is recorded so /health can tell a full fixture sweep
                    # from a narrow results-only night sweep: without this, six hourly
                    # narrow sweeps keep freshness_ok green forever while the full sweep
                    # (fixtures, kickoff moves, supersession) is dead — exactly what hid
                    # the 2026-07-23 outage for ~60h
                    "sweep": "results_only" if results_only else "full",
                    **({"unresolved_teams": unresolved} if unresolved else {}),
                },
            )
        except BaseException:
            # the sweep KIND must survive failure too — a failed results-only sweep with
            # NULL details would be read back as a failed FULL sweep by /activity's
            # coalesce, the exact full-vs-narrow conflation /health was fixed to avoid
            finish_job(
                conn,
                job_id,
                status="failed",
                details={"sweep": "results_only" if results_only else "full"},
            )
            raise
    if failed_days:
        print(f"ingest: provider failures for days {failed_days}")
    if unresolved:
        print(f"ingest: {len(unresolved)} fixture(s) skipped for unmapped teams: {unresolved}")
    return {
        "statusCode": 200,
        "totals": totals,
        "failed_days": failed_days,
        "unresolved_teams": unresolved,
    }


@_observed
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


@_observed
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


@_observed
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


@_observed
def odds(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """T-142 schedule (Contract §9): hourly; capture the 3-way market for fixtures whose
    kickoff falls in [now+2h, now+4h] -> market_snapshot (is_closing=false). Aggregate-display
    rules live in the API layer; raw prices are stored for the same-cutoff comparison only."""
    if (d := _dry(event)) is not None:
        return d
    from ingestion.live import ProviderError
    from ingestion.odds import SportsGameOddsAdapter, ingest_odds_captures

    settings = load_settings(dotenv_path=None)
    if not settings.sportsgameodds_key:
        return {"statusCode": 200, "skipped": "no SPORTSGAMEODDS_KEY configured"}
    now = datetime.now(UTC)
    try:
        # retry_delays=() → ONE bounded attempt, no in-invocation ladder. The default
        # 5/25/125s backoff x 30s socket timeouts can reach ~275s, which exceeds this
        # Lambda's 120s limit — so when the provider HANGS (as SGO did from ~12:00 UTC
        # 2026-07-23, timing out every run) the runtime kills the Lambda mid-retry before
        # the except below can fire → a page. One attempt fails cleanly well inside the
        # timeout; the next hourly run is the retry (same philosophy as the night ingest).
        captures = SportsGameOddsAdapter(settings.sportsgameodds_key).captures(now, retry_delays=())
    except ProviderError as exc:
        # the market feed is best-effort (aggregate-only, post-MVP, BL-2): a provider
        # outage / hang / slow response / expired key must NOT page — it touches no
        # forecast, freeze, grade, or anchor. Logged for visibility; capture resumes on
        # its own once the provider recovers. (A parse/DB bug still raises → alarms.)
        print(f"odds: market provider unavailable, skipping this run: {exc}")
        return {"statusCode": 200, "degraded": "market provider unavailable"}
    with _conn() as conn:
        stats = ingest_odds_captures(conn, captures, now=now)
    return {"statusCode": 200, "captures": len(captures), **stats}


@_observed
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
            # RETROSPECTIVE (fixed 2026-07-25): the old form required kickoff_utc > now(),
            # i.e. the fixture had to still be in the future — a 90-minute window that a
            # once-daily 09:00 UTC canary essentially never lands inside, so the dead-man
            # check for the WORST failure mode could not fire. finalize_fixture refuses to
            # forecast once kickoff passes, so a miss is permanent and must be caught after
            # the fact: any regular-season match kicked off in the last 48h with no
            # un-voided official forecast.
            "SELECT count(*) FROM match m WHERE m.is_regular_season"
            "   AND m.status NOT IN ('postponed','cancelled','abandoned')"
            "   AND m.kickoff_utc < now() AND m.kickoff_utc > now() - interval '48 hours'"
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
        # fixtures the provider served that we could not map to a team (ADR-006). The sweep
        # now skips them instead of halting, so this daily check is what keeps the gap
        # visible: it stays lit until an alias is added or the fixture leaves the window.
        skipped = conn.execute(
            "SELECT details->'unresolved_teams' FROM job_run"
            " WHERE job_name = 'ingest' AND status = 'done'"
            "   AND details ? 'unresolved_teams'"
            "   AND finished_at_utc > now() - interval '24 hours'"
            " ORDER BY finished_at_utc DESC LIMIT 1"
        ).fetchone()
        unmapped = [] if skipped is None or skipped[0] is None else list(skipped[0])
    if unmapped:
        problems.append(
            f"{len(unmapped)} fixture(s) skipped for unmapped teams: {unmapped} "
            "(add the alias, or exclude the fixture if it is not regular season)"
        )
    if n_overdue:
        problems.append(f"{n_overdue} match(es) kicked off >24h ago without a final result")
    if n_missed:
        problems.append(
            f"{n_missed} match(es) kicked off in the last 48h with NO official forecast"
        )
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
