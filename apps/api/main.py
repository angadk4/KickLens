"""T-180: the read-only public API (Contract §8: slim Lambda zip, no ML libs).

Every endpoint is a pure DB read; evidence scopes are explicit and never merged (T-171);
raw odds are never returned (aggregate-only display rule). T-181 wraps `app` with Mangum.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import psycopg
from common.config import load_settings
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

FRESHNESS_LIMIT = timedelta(hours=36)

app = FastAPI(
    title="KickLens API",
    description="Methodologically honest MLS 1X2 forecasts with a tamper-evident record.",
    version="0.1.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def db() -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(load_settings().database_url)
    try:
        yield conn
    finally:
        conn.close()


Conn = Annotated[psycopg.Connection, Depends(db)]


@app.get("/health")
def health(conn: Conn) -> dict[str, Any]:
    row = conn.execute(
        # an UNCHANGED ingest sweep is still a successful poll: count the completed ingest
        # job_run, not only stored revisions (launch-review follow-up — quiet weeks are fresh)
        "SELECT greatest((SELECT max(fetched_at_utc) FROM source_fixture),"
        " (SELECT max(created_at_utc) FROM dataset_snapshot),"
        " (SELECT max(finished_at_utc) FROM job_run"
        "   WHERE job_name = 'ingest' AND status = 'done')),"
        " (SELECT max(graded_at_utc) FROM prediction_grade)"
    ).fetchone()
    last_ingest = row[0] if row else None
    freshness_ok = bool(last_ingest and datetime.now(UTC) - last_ingest <= FRESHNESS_LIMIT)
    return {
        "status": "ok",
        "last_ingest": _iso(last_ingest),
        "last_grade": _iso(row[1] if row else None),
        "freshness_ok": freshness_ok,
    }


@app.get("/leagues")
def leagues(conn: Conn) -> list[dict[str, Any]]:
    return [
        {"league_id": int(r[0]), "code": r[1], "name": r[2]}
        for r in conn.execute("SELECT league_id, code, name FROM league").fetchall()
    ]


@app.get("/matches/upcoming")
def matches_upcoming(conn: Conn, limit: int = Query(50, le=200)) -> list[dict[str, Any]]:
    """Upcoming fixtures with their official (frozen) or draft (preliminary) forecast."""
    rows = conn.execute(
        "SELECT m.match_id, m.kickoff_utc, h.canonical_name, a.canonical_name, s.year,"
        " p.p_home, p.p_draw, p.p_away, p.forecast_hash,"
        " d.p_home, d.p_draw, d.p_away"
        " FROM match m JOIN season s USING (season_id)"
        " JOIN team h ON h.team_id = m.home_team_id"
        " JOIN team a ON a.team_id = m.away_team_id"
        " LEFT JOIN LATERAL (SELECT * FROM prediction pp WHERE pp.match_id = m.match_id"
        "   AND pp.is_official AND NOT EXISTS (SELECT 1 FROM prediction_event e"
        "     WHERE e.prediction_id = pp.prediction_id AND e.event_type='Voided')"
        "   ORDER BY pp.forecast_creation_utc DESC LIMIT 1) p ON true"
        " LEFT JOIN draft_prediction d ON d.match_id = m.match_id"
        " WHERE m.result IS NULL AND m.kickoff_utc > now() AND m.is_regular_season"
        " ORDER BY m.kickoff_utc LIMIT %s",
        (limit,),
    ).fetchall()
    out = []
    for r in rows:
        entry: dict[str, Any] = {
            "match_id": int(r[0]),
            "kickoff_utc": _iso(r[1]),
            "home": r[2],
            "away": r[3],
            "season": int(r[4]),
        }
        if r[5] is not None:
            entry["forecast"] = {
                "type": "official-frozen",
                "p_home": float(r[5]),
                "p_draw": float(r[6]),
                "p_away": float(r[7]),
                "forecast_hash": r[8],
            }
        elif r[9] is not None:
            entry["forecast"] = {
                "type": "draft-preliminary",
                "p_home": float(r[9]),
                "p_draw": float(r[10]),
                "p_away": float(r[11]),
            }
        out.append(entry)
    return out


@app.get("/matches/{match_id}")
def match_detail(match_id: int, conn: Conn) -> dict[str, Any]:
    row = conn.execute(
        "SELECT m.match_id, m.kickoff_utc, m.status, m.result, m.home_goals, m.away_goals,"
        " h.canonical_name, a.canonical_name, s.year"
        " FROM match m JOIN season s USING (season_id)"
        " JOIN team h ON h.team_id = m.home_team_id JOIN team a ON a.team_id = m.away_team_id"
        " WHERE m.match_id = %s",
        (match_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "match not found")
    events = conn.execute(
        "SELECT event_type, event_time_utc FROM prediction_event WHERE match_id = %s"
        " ORDER BY prediction_event_id",
        (match_id,),
    ).fetchall()
    forecasts = conn.execute(
        "SELECT p.prediction_id, p.p_home, p.p_draw, p.p_away, p.cutoff_utc,"
        " p.forecast_creation_utc, p.forecast_hash, p.fixture_revision,"
        " g.log_loss, g.rps, g.brier, g.correct"
        " FROM prediction p LEFT JOIN LATERAL (SELECT * FROM prediction_grade gg"
        "   WHERE gg.prediction_id = p.prediction_id ORDER BY gg.result_version DESC LIMIT 1)"
        "   g ON true"
        " WHERE p.match_id = %s ORDER BY p.forecast_creation_utc",
        (match_id,),
    ).fetchall()
    return {
        "match_id": int(row[0]),
        "kickoff_utc": _iso(row[1]),
        "status": row[2],
        "result": row[3],
        "score": None if row[4] is None else f"{row[4]}-{row[5]}",
        "home": row[6],
        "away": row[7],
        "season": int(row[8]),
        "events": [{"type": e[0], "at": _iso(e[1])} for e in events],
        "forecasts": [
            {
                "p_home": float(f[1]),
                "p_draw": float(f[2]),
                "p_away": float(f[3]),
                "cutoff_utc": _iso(f[4]),
                "created_utc": _iso(f[5]),
                "forecast_hash": f[6],
                "fixture_revision": int(f[7]),
                "grade": None
                if f[8] is None
                else {
                    "log_loss": float(f[8]),
                    "rps": float(f[9]),
                    "brier": float(f[10]),
                    "correct": bool(f[11]),
                },
            }
            for f in forecasts
        ],
    }


@app.get("/predictions/completed")
def predictions_completed(
    conn: Conn, limit: int = Query(50, le=200), offset: int = 0
) -> dict[str, Any]:
    rows = conn.execute(
        "SELECT p.match_id, h.canonical_name, a.canonical_name, m.kickoff_utc, m.result,"
        " p.p_home, p.p_draw, p.p_away, p.forecast_hash, g.log_loss, g.correct"
        " FROM prediction p JOIN match m USING (match_id)"
        " JOIN team h ON h.team_id = m.home_team_id JOIN team a ON a.team_id = m.away_team_id"
        " JOIN LATERAL (SELECT * FROM prediction_grade gg WHERE gg.prediction_id = p.prediction_id"
        "   ORDER BY gg.result_version DESC LIMIT 1) g ON true"
        " WHERE p.is_official ORDER BY m.kickoff_utc DESC LIMIT %s OFFSET %s",
        (limit, offset),
    ).fetchall()
    total = conn.execute("SELECT count(DISTINCT prediction_id) FROM prediction_grade").fetchone()
    return {
        "total_graded": 0 if total is None else int(total[0]),
        "items": [
            {
                "match_id": int(r[0]),
                "home": r[1],
                "away": r[2],
                "kickoff_utc": _iso(r[3]),
                "result": r[4],
                "p_home": float(r[5]),
                "p_draw": float(r[6]),
                "p_away": float(r[7]),
                "forecast_hash": r[8],
                "log_loss": float(r[9]),
                "correct": bool(r[10]),
            }
            for r in rows
        ],
    }


@app.get("/performance")
def performance(conn: Conn, scope: str = Query(...)) -> dict[str, Any]:
    """Latest metrics snapshot for ONE scope — scopes are never merged (T-171)."""
    if scope not in ("dev", "test", "backtest", "live"):
        raise HTTPException(400, "scope must be one of dev|test|backtest|live")
    row = conn.execute(
        "SELECT payload, as_of_utc FROM metrics_snapshot WHERE scope = %s"
        " ORDER BY as_of_utc DESC LIMIT 1",
        (scope,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"no metrics recorded for scope '{scope}' yet")
    payload = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    return {"scope": scope, "as_of_utc": _iso(row[1]), "metrics": payload}


@app.get("/calibration")
def calibration(conn: Conn) -> dict[str, Any]:
    """Calibration diagnostics per scope (dev evidence + live as it accrues)."""
    out: dict[str, Any] = {}
    for scope in ("dev", "live"):
        row = conn.execute(
            "SELECT payload FROM metrics_snapshot WHERE scope = %s ORDER BY as_of_utc DESC LIMIT 1",
            (scope,),
        ).fetchone()
        if row is not None:
            payload = row[0] if isinstance(row[0], dict) else json.loads(row[0])
            out[scope] = {k: payload.get(k) for k in ("n", "ece", "by_confidence") if k in payload}
    return out


@app.get("/model-versions")
def model_versions(conn: Conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT mv.model_version_id, mv.version_label, mv.is_production, mv.created_at_utc,"
        " mv.promoted_at_utc, l.code FROM model_version mv JOIN league l USING (league_id)"
        " ORDER BY mv.model_version_id"
    ).fetchall()
    return [
        {
            "model_version_id": int(r[0]),
            "label": r[1],
            "is_production": bool(r[2]),
            "created_utc": _iso(r[3]),
            "promoted_utc": _iso(r[4]),
            "league": r[5],
        }
        for r in rows
    ]


@app.get("/methodology")
def methodology() -> dict[str, Any]:
    return {
        "model": "multinomial logistic regression (L2) on Elo difference + neutral-site flag, "
        "with temperature-scaled calibration; selection frozen 2026-07-06 before the "
        "touch-once 2025 test",
        "cutoff": "official forecasts freeze at kickoff minus 3 hours; never revised after",
        "tamper_evidence": "each forecast is SHA-256 hashed and anchored to a public git file "
        "at creation; a daily Merkle root is committed at 12:00 UTC",
        "evidence_separation": "dev / test / backtest / live records are never merged; each "
        "metric is tagged with its scope and sample size",
        "honesty_notes": [
            "the model is statistically equivalent to a plain Elo baseline on dev data "
            "(difference +0.0001 nats, CI [-0.003, +0.003]) - no superiority claim is made",
            "the de-vigged closing market outperforms the model by ~0.02 nats on dev data; "
            "closing odds embed later information than the T-3h cutoff",
            "draws are the hardest outcome; accuracy is a diagnostic, never a selection metric",
        ],
        "data": "football-data.co.uk (historical); Highlightly (live fixtures); "
        "SportsGameOdds (live odds, aggregate display only)",
    }


def _iso(dt: datetime | None) -> str | None:
    return None if dt is None else dt.isoformat(timespec="seconds")
