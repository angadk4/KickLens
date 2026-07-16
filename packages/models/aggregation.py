"""T-170/T-171: metrics_snapshot recompute + evidence separation (NEVER-CUT: T-171).

Metrics derive ONLY from immutable graded data (latest grade per prediction). Every snapshot
carries a scope tag from the frozen four — 'dev' | 'test' | 'backtest' | 'live' — enforced by
the DB CHECK; scopes are never merged (CLAUDE.md §2.2 evidence separation).
Live metrics: overall + rolling + by-month + by-confidence, model and (when captured) market.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Literal

import psycopg

Scope = Literal["dev", "test", "backtest", "live"]
CONFIDENCE_BINS = ((0.0, 0.4), (0.4, 0.5), (0.5, 0.6), (0.6, 1.01))


def recompute_live_snapshot(conn: psycopg.Connection) -> int:
    """Aggregate the LIVE record from graded official forecasts. Idempotent append
    (a new snapshot row per recompute; the API serves the newest per scope)."""
    rows = conn.execute(
        "SELECT DISTINCT ON (g.prediction_id) g.log_loss, g.rps, g.brier, g.correct,"
        " p.p_home, p.p_draw, p.p_away, m.kickoff_utc, m.result"
        " FROM prediction_grade g JOIN prediction p USING (prediction_id)"
        " JOIN match m ON m.match_id = p.match_id"
        " ORDER BY g.prediction_id, g.result_version DESC"
    ).fetchall()
    n = len(rows)
    payload: dict[str, object] = {"n": n}
    if n:
        from models.metrics import classwise_ece, ece

        lls = [float(r[0]) for r in rows]
        probs = [(float(r[4]), float(r[5]), float(r[6])) for r in rows]
        outcomes = [str(r[8]) for r in rows]
        cw = classwise_ece(probs, outcomes)
        payload.update(
            {
                "log_loss": sum(lls) / n,
                "rps": sum(float(r[1]) for r in rows) / n,
                "brier": sum(float(r[2]) for r in rows) / n,
                "accuracy": sum(bool(r[3]) for r in rows) / n,
                "ece": ece(probs, outcomes),
                "classwise_ece_H": cw.get("H"),
                "classwise_ece_D": cw.get("D"),
                "classwise_ece_A": cw.get("A"),
                "by_month": _by_month(rows),
                "by_confidence": _by_confidence(rows),
                "rolling_last_20": sum(lls[-20:]) / min(n, 20),
            }
        )
    return write_snapshot(conn, "live", payload)


def _by_month(rows: list[tuple[Any, ...]]) -> dict[str, dict[str, float]]:
    buckets: dict[str, list[float]] = {}
    for r in rows:
        buckets.setdefault(f"{r[7]:%Y-%m}", []).append(float(r[0]))
    return {
        k: {"n": float(len(v)), "log_loss": sum(v) / len(v)} for k, v in sorted(buckets.items())
    }


def _by_confidence(rows: list[tuple[Any, ...]]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for lo, hi in CONFIDENCE_BINS:
        sub = [r for r in rows if lo <= max(float(r[4]), float(r[5]), float(r[6])) < hi]
        if sub:
            out[f"{lo:.1f}-{min(hi, 1.0):.1f}"] = {
                "n": float(len(sub)),
                "log_loss": sum(float(r[0]) for r in sub) / len(sub),
                "accuracy": sum(bool(r[3]) for r in sub) / len(sub),
            }
    return out


def write_snapshot(conn: psycopg.Connection, scope: Scope, payload: dict[str, object]) -> int:
    row = conn.execute(
        "INSERT INTO metrics_snapshot (scope, as_of_utc, payload, created_at_utc)"
        " VALUES (%s,%s,%s,%s) RETURNING metrics_snapshot_id",
        (scope, datetime.now(UTC), json.dumps(payload), datetime.now(UTC)),
    ).fetchone()
    assert row is not None
    return int(row[0])


def publish_dev_snapshot(conn: psycopg.Connection) -> int:
    """The dev walk-forward evidence (from the sealed selection) as a 'dev'-scoped snapshot —
    displayed on the dashboard strictly separated from test/backtest/live."""
    payload = {
        "n": 3012,
        "log_loss": 1.0346,
        # sealed dev champion CI + secondary metrics from docs/model-card.md — additive keys;
        # the ladder promises whiskers "where one exists", and the champion has one
        "log_loss_ci95": [1.018, 1.051],
        "rps": 0.2168,
        "accuracy": 0.493,
        "ece": 0.0108,
        "champion": "logistic-F1-C0.1+temperature",
        "incumbent_b3_log_loss": 1.0345,
        "market_log_loss": 1.0149,
        "note": "dev 2018-2024 walk-forward; equivalence with B3 recorded; see docs/selection.md",
    }
    return write_snapshot(conn, "dev", payload)


def latest_snapshot(conn: psycopg.Connection, scope: Scope) -> dict[str, object] | None:
    """Scope-tagged read — the ONLY sanctioned way to fetch metrics (T-171)."""
    row = conn.execute(
        "SELECT payload FROM metrics_snapshot WHERE scope = %s ORDER BY as_of_utc DESC LIMIT 1",
        (scope,),
    ).fetchone()
    if row is None:
        return None
    payload = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    payload["_scope"] = scope  # every metric leaves tagged by evidence type
    return payload
