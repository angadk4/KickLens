"""T-180: the read-only public API (Contract §8: slim Lambda zip, no ML libs).

Every endpoint is a pure DB read; evidence scopes are explicit and never merged (T-171);
raw odds are never returned (aggregate-only display rule). T-181 wraps `app` with Mangum.

Dashboard-v2 additions (all additive — old shapes unchanged): /matches/{id}/verification
(tamper-evidence showcase: server-recomputed hash vs the stored write-once hash, public anchor
links, daily Merkle root), /teams/ratings (Elo replay with the SAME engine that feeds the model),
/merkle-roots, richer /matches/{id} + /predictions/completed + /methodology, and Cache-Control
headers (browser caching protects Neon scale-to-zero from refresh storms).
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from typing import Annotated, Any

import psycopg
from common.config import Settings, load_settings
from common.hashing import ForecastFields, canonical_json, forecast_hash
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from features.elo import INIT_RATING, SEASON_REGRESS, EloMatch, run_chronologically

FRESHNESS_LIMIT = timedelta(hours=36)

app = FastAPI(
    title="KickLens API",
    description="Methodologically honest MLS 1X2 forecasts with a tamper-evident record.",
    version="0.2.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@lru_cache(maxsize=1)
def _settings() -> Settings:
    """Settings are immutable per Lambda instance — cache to avoid a per-request SSM read."""
    return load_settings()


def db() -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(_settings().database_url)
    try:
        yield conn
    finally:
        conn.close()


Conn = Annotated[psycopg.Connection, Depends(db)]


def _cache(response: Response, seconds: int) -> None:
    response.headers["Cache-Control"] = f"public, max-age={seconds}"


def _full_iso(dt: datetime) -> str:
    """Hash-precision timestamp — must reproduce the exact string finalize_fixture hashed."""
    return dt.astimezone(UTC).isoformat()


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
def leagues(conn: Conn, response: Response) -> list[dict[str, Any]]:
    _cache(response, 3600)
    return [
        {"league_id": int(r[0]), "code": r[1], "name": r[2]}
        for r in conn.execute("SELECT league_id, code, name FROM league").fetchall()
    ]


@app.get("/matches/upcoming")
def matches_upcoming(
    conn: Conn, response: Response, limit: int = Query(50, le=200)
) -> list[dict[str, Any]]:
    """Upcoming fixtures with their official (frozen) or draft (preliminary) forecast."""
    _cache(response, 60)
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
def match_detail(match_id: int, conn: Conn, response: Response) -> dict[str, Any]:
    _cache(response, 60)
    row = conn.execute(
        "SELECT m.match_id, m.kickoff_utc, m.status, m.result, m.home_goals, m.away_goals,"
        " h.canonical_name, a.canonical_name, s.year, m.neutral_site"
        " FROM match m JOIN season s USING (season_id)"
        " JOIN team h ON h.team_id = m.home_team_id JOIN team a ON a.team_id = m.away_team_id"
        " WHERE m.match_id = %s",
        (match_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "match not found")
    events = conn.execute(
        "SELECT event_type, event_time_utc, details FROM prediction_event WHERE match_id = %s"
        " ORDER BY prediction_event_id",
        (match_id,),
    ).fetchall()
    forecasts = conn.execute(
        "SELECT p.prediction_id, p.p_home, p.p_draw, p.p_away, p.cutoff_utc,"
        " p.forecast_creation_utc, p.forecast_hash, p.fixture_revision,"
        " g.log_loss, g.rps, g.brier, g.correct,"
        " p.anchored_at_utc, r.stale_inputs, r.model_version_id, mv.version_label,"
        " EXISTS (SELECT 1 FROM prediction_event ve WHERE ve.prediction_id = p.prediction_id"
        "   AND ve.event_type = 'Voided') AS voided"
        " FROM prediction p"
        " JOIN prediction_run r USING (prediction_run_id)"
        " JOIN model_version mv ON mv.model_version_id = r.model_version_id"
        " LEFT JOIN LATERAL (SELECT * FROM prediction_grade gg"
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
        "neutral_site": bool(row[9]),
        "events": [{"type": e[0], "at": _iso(e[1]), "details": e[2]} for e in events],
        "forecasts": [
            {
                "prediction_id": int(f[0]),
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
                "anchored_at_utc": _iso(f[12]),
                "stale_inputs": bool(f[13]),
                "model_version_id": int(f[14]),
                "model_label": f[15],
                "voided": bool(f[16]),
            }
            for f in forecasts
        ],
    }


@app.get("/predictions/completed")
def predictions_completed(
    conn: Conn, response: Response, limit: int = Query(50, le=200), offset: int = 0
) -> dict[str, Any]:
    _cache(response, 300)
    rows = conn.execute(
        "SELECT p.match_id, h.canonical_name, a.canonical_name, m.kickoff_utc, m.result,"
        " p.p_home, p.p_draw, p.p_away, p.forecast_hash, g.log_loss, g.correct,"
        " g.rps, g.brier"
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
                "rps": float(r[11]),
                "brier": float(r[12]),
            }
            for r in rows
        ],
    }


@app.get("/performance")
def performance(conn: Conn, response: Response, scope: str = Query(...)) -> dict[str, Any]:
    """Latest metrics snapshot for ONE scope — scopes are never merged (T-171)."""
    if scope not in ("dev", "test", "backtest", "live"):
        raise HTTPException(400, "scope must be one of dev|test|backtest|live")
    _cache(response, 300)
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
def calibration(conn: Conn, response: Response) -> dict[str, Any]:
    """Calibration diagnostics per scope (dev evidence + the sealed test point + live as it
    accrues). Scopes are separate keys — never merged."""
    _cache(response, 300)
    out: dict[str, Any] = {}
    for scope in ("dev", "test", "live"):
        row = conn.execute(
            "SELECT payload FROM metrics_snapshot WHERE scope = %s ORDER BY as_of_utc DESC LIMIT 1",
            (scope,),
        ).fetchone()
        if row is not None:
            payload = row[0] if isinstance(row[0], dict) else json.loads(row[0])
            out[scope] = {k: payload.get(k) for k in ("n", "ece", "by_confidence") if k in payload}
    return out


@app.get("/model-versions")
def model_versions(conn: Conn, response: Response) -> list[dict[str, Any]]:
    _cache(response, 3600)
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


# Sealed dev-era baseline ladder (docs/baselines.md, 2018-2024 walk-forward, 210 blocks,
# n=3,012 - frozen 2026-07-06 evidence; there is deliberately no DB table for it).
_BASELINE_LADDER: list[dict[str, Any]] = [
    {"rung": "B0", "name": "global outcome floor", "log_loss": 1.0825, "ci95": [1.0747, 1.0904]},
    {"rung": "B1", "name": "home/away rates", "log_loss": 1.0499, "ci95": [1.0363, 1.0641]},
    {"rung": "B2", "name": "expanding rates", "log_loss": 1.0498, "ci95": [1.0362, 1.0640]},
    {"rung": "B3", "name": "Elo ordinal (incumbent)", "log_loss": 1.0345, "ci95": [1.0182, 1.0507]},
    {"rung": "B4", "name": "independent Poisson", "log_loss": 1.2299, "ci95": [1.1663, 1.3011]},
    {"rung": "B5", "name": "Dixon-Coles", "log_loss": 1.0627, "ci95": [1.0396, 1.0866]},
    {"rung": "champion", "name": "logistic F1 + temperature", "log_loss": 1.0346, "ci95": None},
    {
        "rung": "market-closing",
        "name": "de-vigged closing market (stronger-information reference)",
        "log_loss": 1.0149,
        "ci95": None,
    },
]


@app.get("/methodology")
def methodology(conn: Conn, response: Response) -> dict[str, Any]:
    _cache(response, 3600)
    prod = conn.execute(
        "SELECT ca.method, ca.param_t, ds.snapshot_hash, ds.row_count, ds.date_range_start,"
        " ds.date_range_end, ds.created_at_utc"
        " FROM model_version mv JOIN model_artifact ma USING (model_artifact_id)"
        " JOIN training_run tr ON tr.training_run_id = ma.training_run_id"
        " LEFT JOIN calibration_artifact ca"
        "   ON ca.calibration_artifact_id = mv.calibration_artifact_id"
        " LEFT JOIN dataset_snapshot ds ON ds.dataset_snapshot_id = tr.dataset_snapshot_id"
        " WHERE mv.is_production LIMIT 1"
    ).fetchone()
    repo = _settings().github_anchor_repo
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
        "calibration": {
            "method": None if prod is None else prod[0],
            "param_t": None if prod is None or prod[1] is None else float(prod[1]),
            "note": "temperature fitted on the trailing 20% of the training window; "
            "dev mean per-fold T = 1.157",
        },
        "dataset": {
            "snapshot_hash": None if prod is None else prod[2],
            "row_count": None if prod is None or prod[3] is None else int(prod[3]),
            "date_range_start": None if prod is None else _iso_date(prod[4]),
            "date_range_end": None if prod is None else _iso_date(prod[5]),
            "created_utc": None if prod is None else _iso(prod[6]),
        },
        "baselines": {
            "scope": "dev",
            "n": 3012,
            "note": "sealed 2026-07-06 walk-forward ladder (2018-2024, 210 matchweek blocks) - "
            "docs/baselines.md; scopes never merged",
            "ladder": _BASELINE_LADDER,
        },
        "anchor_repo_html_url": None
        if not repo
        else f"https://github.com/{repo}/tree/main/anchors",
    }


# ---------------- dashboard v2: tamper-evidence verification ----------------


def _anchor_urls(repo: str | None, day: str | None) -> dict[str, Any] | None:
    if not repo or not day:
        return None
    return {
        "raw_url": f"https://raw.githubusercontent.com/{repo}/main/anchors/{day}.jsonl",
        "html_url": f"https://github.com/{repo}/blob/main/anchors/{day}.jsonl",
    }


@app.get("/matches/{match_id}/verification")
def match_verification(match_id: int, conn: Conn, response: Response) -> dict[str, Any]:
    """The tamper-evidence showcase: for every official forecast of this match, recompute the
    SHA-256 from the frozen Contract §7 field set (reconstructed from the DB) and compare it to
    the stored write-once hash; link the public anchor file + daily Merkle root so anyone can
    verify independently. canonical_json is exposed ONLY when the recomputed hash matches."""
    _cache(response, 300)
    match_row = conn.execute(
        "SELECT m.match_id, m.kickoff_utc, h.canonical_name, a.canonical_name, s.year"
        " FROM match m JOIN season s USING (season_id)"
        " JOIN team h ON h.team_id = m.home_team_id JOIN team a ON a.team_id = m.away_team_id"
        " WHERE m.match_id = %s",
        (match_id,),
    ).fetchone()
    if match_row is None:
        raise HTTPException(404, "match not found")
    rows = conn.execute(
        "SELECT p.prediction_id, p.fixture_revision, p.p_home, p.p_draw, p.p_away,"
        " p.cutoff_utc, p.forecast_creation_utc, p.forecast_hash, p.anchored_at_utc,"
        " r.model_version_id, r.feature_set_version, r.data_freshness_time_utc,"
        " r.stale_inputs, r.code_git_sha, r.seed, r.lockfile_hash, mv.version_label,"
        " EXISTS (SELECT 1 FROM prediction_event ve WHERE ve.prediction_id = p.prediction_id"
        "   AND ve.event_type = 'Voided') AS voided"
        " FROM prediction p JOIN prediction_run r USING (prediction_run_id)"
        " JOIN model_version mv ON mv.model_version_id = r.model_version_id"
        " WHERE p.match_id = %s AND p.is_official ORDER BY p.forecast_creation_utc",
        (match_id,),
    ).fetchall()
    events = conn.execute(
        "SELECT prediction_id, event_type, event_time_utc, details FROM prediction_event"
        " WHERE match_id = %s ORDER BY prediction_event_id",
        (match_id,),
    ).fetchall()
    days = sorted({r[8].astimezone(UTC).date() for r in rows if r[8] is not None})
    merkle_rows = (
        conn.execute(
            "SELECT day, root, committed_at_utc FROM anchor_merkle_root WHERE day = ANY(%s)",
            (days,),
        ).fetchall()
        if days
        else []
    )
    merkle_by_day = {m[0]: m for m in merkle_rows}
    repo = _settings().github_anchor_repo

    forecasts: list[dict[str, Any]] = []
    for r in rows:
        fields = ForecastFields(
            match_id=match_id,
            fixture_revision=int(r[1]),
            model_version_id=int(r[9]),
            calibration_artifact_id=None,  # matches the finalize_fixture write path exactly
            feature_set_version=str(r[10]),
            p_home=float(r[2]),
            p_draw=float(r[3]),
            p_away=float(r[4]),
            cutoff_utc=_full_iso(r[5]),
            forecast_creation_utc=_full_iso(r[6]),
            data_freshness_time=_full_iso(r[11]),
        )
        stored = str(r[7])
        recomputed = forecast_hash(fields)
        hash_match = recomputed == stored
        anchored_at: datetime | None = r[8]
        anchor_day = None if anchored_at is None else f"{anchored_at.astimezone(UTC):%Y-%m-%d}"
        expected_line = (
            None
            if anchored_at is None
            else json.dumps(
                {
                    "forecast_hash": stored,
                    "match_id": match_id,
                    "cutoff_utc": fields.cutoff_utc,
                    "anchored_at_utc": anchored_at.astimezone(UTC).isoformat(timespec="seconds"),
                },
                sort_keys=True,
            )
        )
        merkle = None
        if anchored_at is not None:
            mrow = merkle_by_day.get(anchored_at.astimezone(UTC).date())
            if mrow is not None:
                merkle = {
                    "day": _iso_date(mrow[0]),
                    "root": str(mrow[1]),
                    "committed_at_utc": _iso(mrow[2]),
                }
        forecasts.append(
            {
                "prediction_id": int(r[0]),
                "voided": bool(r[17]),
                "forecast_hash": stored,
                "recomputed_hash": recomputed,
                "hash_match": hash_match,
                "canonical_json": canonical_json(fields) if hash_match else None,
                "fields": {
                    "match_id": fields.match_id,
                    "fixture_revision": fields.fixture_revision,
                    "model_version_id": fields.model_version_id,
                    "calibration_artifact_id": fields.calibration_artifact_id,
                    "feature_set_version": fields.feature_set_version,
                    "p_home": fields.p_home,
                    "p_draw": fields.p_draw,
                    "p_away": fields.p_away,
                    "cutoff_utc": fields.cutoff_utc,
                    "forecast_creation_utc": fields.forecast_creation_utc,
                    "data_freshness_time": fields.data_freshness_time,
                },
                "model_label": r[16],
                "stale_inputs": bool(r[12]),
                "code_git_sha": r[13],
                "seed": int(r[14]),
                "lockfile_hash": r[15],
                "anchored_at_utc": _iso(anchored_at),
                "anchor_day": anchor_day,
                "expected_anchor_line": expected_line,
                "anchor_file": _anchor_urls(repo, anchor_day),
                "merkle": merkle,
                "events": [
                    {"type": e[1], "at": _iso(e[2]), "details": e[3]}
                    for e in events
                    if e[0] is not None and int(e[0]) == int(r[0])
                ],
            }
        )
    return {
        "match_id": int(match_row[0]),
        "kickoff_utc": _iso(match_row[1]),
        "home": match_row[2],
        "away": match_row[3],
        "season": int(match_row[4]),
        "anchor_repo": repo,
        "hash_algorithm": "SHA-256 over canonical JSON (sorted keys, compact separators) of the "
        "frozen Contract 7 field set",
        "merkle_algorithm": "SHA-256 pairwise over sorted leaf hashes, odd leaf promoted; "
        "committed daily at 12:00 UTC for the previous UTC day",
        "forecasts": forecasts,
    }


@app.get("/merkle-roots")
def merkle_roots(conn: Conn, response: Response, limit: int = Query(30, le=180)) -> dict[str, Any]:
    _cache(response, 300)
    rows = conn.execute(
        "SELECT day, root, committed_at_utc FROM anchor_merkle_root ORDER BY day DESC LIMIT %s",
        (limit,),
    ).fetchall()
    repo = _settings().github_anchor_repo
    items = []
    for r in rows:
        day = _iso_date(r[0])
        urls = _anchor_urls(repo, day)
        items.append(
            {
                "day": day,
                "root": str(r[1]),
                "committed_at_utc": _iso(r[2]),
                "anchor_file_raw_url": None if urls is None else urls["raw_url"],
                "anchor_file_html_url": None if urls is None else urls["html_url"],
            }
        )
    return {
        "repo": repo,
        "algorithm": "SHA-256 pairwise over sorted leaf hashes, odd leaf promoted",
        "items": items,
    }


# ---------------- dashboard v2: Elo power ratings (replay-on-demand) ----------------

# Memoized full ratings structure, keyed on (completed-match count, max kickoff): a newly
# graded match changes the key and triggers one ~6k-row replay (<100ms pure Python).
_RATINGS_CACHE: tuple[tuple[int, str], dict[str, Any]] | None = None


def _compute_ratings(conn: psycopg.Connection) -> dict[str, Any]:
    rows = conn.execute(
        "SELECT m.match_id, s.year, m.kickoff_utc, m.home_team_id, m.away_team_id,"
        " m.home_goals, m.away_goals FROM match m JOIN season s USING (season_id)"
        " WHERE m.is_regular_season AND m.result IS NOT NULL AND m.kickoff_utc IS NOT NULL"
        " ORDER BY m.kickoff_utc, m.match_id"
    ).fetchall()
    names = {
        int(t[0]): str(t[1])
        for t in conn.execute("SELECT team_id, canonical_name FROM team").fetchall()
    }
    season_row = conn.execute(
        "SELECT max(s.year) FROM season s JOIN match m USING (season_id) WHERE m.is_regular_season"
    ).fetchone()
    latest_season = None if season_row is None or season_row[0] is None else int(season_row[0])
    active: set[int] = set()
    if latest_season is not None:
        for t in conn.execute(
            "SELECT m.home_team_id, m.away_team_id FROM match m JOIN season s USING (season_id)"
            " WHERE s.year = %s AND m.is_regular_season",
            (latest_season,),
        ).fetchall():
            active.add(int(t[0]))
            active.add(int(t[1]))

    matches = [
        EloMatch(
            match_id=int(r[0]),
            season_year=int(r[1]),
            order_key=r[2],
            match_date=r[2].date(),
            home_team_id=int(r[3]),
            away_team_id=int(r[4]),
            home_goals=int(r[5]),
            away_goals=int(r[6]),
        )
        for r in rows
    ]
    replay = run_chronologically(matches)

    # per-team trajectory: (match, pre, post, is_home) in chronological order
    hist: dict[int, list[tuple[EloMatch, float, float, bool]]] = {}
    for m, pre_h, pre_a, post_h, post_a in replay:
        hist.setdefault(m.home_team_id, []).append((m, pre_h, post_h, True))
        hist.setdefault(m.away_team_id, []).append((m, pre_a, post_a, False))

    teams: list[dict[str, Any]] = []
    for team_id in active:
        h = hist.get(team_id, [])
        if h:
            last_match, _, last_post, _ = h[-1]
            rating = last_post
            # lazy start-of-season regression, exactly as EloEngine._rating applies it
            if latest_season is not None and last_match.season_year < latest_season:
                rating = INIT_RATING + SEASON_REGRESS * (rating - INIT_RATING)
        else:
            rating = INIT_RATING  # promoted team with no completed matches yet
        form = ""
        for m, _pre, _post, is_home in reversed(h[-5:]):
            gd = m.home_goals - m.away_goals if is_home else m.away_goals - m.home_goals
            form += "W" if gd > 0 else "D" if gd == 0 else "L"
        played_season = sum(
            1
            for m, _p, _q, _ih in h
            if latest_season is not None and m.season_year == latest_season
        )
        delta_5 = None if not h else round(rating - h[max(0, len(h) - 5)][1], 1)
        teams.append(
            {
                "team_id": team_id,
                "team": names.get(team_id, f"team {team_id}"),
                "rating": round(rating, 1),
                "form": form,
                "played_season": played_season,
                "delta_5": delta_5,
                "provisional": len(h) < 10,
                "last_match_utc": None if not h else _iso(h[-1][0].order_key),
                "history": [
                    {"date": m.match_date.isoformat(), "rating": round(post, 1)}
                    for m, _pre, post, _ih in h
                ],
            }
        )
    teams.sort(key=lambda entry: (-float(entry["rating"]), str(entry["team"])))
    for i, entry in enumerate(teams):
        entry["rank"] = i + 1
    return {
        "as_of_utc": None if not matches else _iso(max(m.order_key for m in matches)),
        "season": latest_season,
        "n_rated_matches": len(matches),
        "method": "chronological Elo replay (K=20, home adv 60, MOV multiplier, ADR-001 draws)"
        " - the same engine that feeds the model's elo_diff feature",
        "teams": teams,
    }


@app.get("/teams/ratings")
def teams_ratings(
    conn: Conn, response: Response, history: int = Query(0, ge=0, le=40)
) -> dict[str, Any]:
    global _RATINGS_CACHE
    _cache(response, 300)
    key_row = conn.execute(
        "SELECT count(*), coalesce(max(kickoff_utc)::text, '') FROM match"
        " WHERE is_regular_season AND result IS NOT NULL"
    ).fetchone()
    assert key_row is not None
    key = (int(key_row[0]), str(key_row[1]))
    if _RATINGS_CACHE is None or _RATINGS_CACHE[0] != key:
        _RATINGS_CACHE = (key, _compute_ratings(conn))
    full = _RATINGS_CACHE[1]
    teams = []
    for t in full["teams"]:
        out = {k: v for k, v in t.items() if k != "history"}
        if history > 0:
            out["history"] = t["history"][-history:]
        teams.append(out)
    return {
        "as_of_utc": full["as_of_utc"],
        "generated_at_utc": _iso(datetime.now(UTC)),
        "season": full["season"],
        "n_rated_matches": full["n_rated_matches"],
        "method": full["method"],
        "teams": teams,
    }


def _iso(dt: datetime | None) -> str | None:
    return None if dt is None else dt.isoformat(timespec="seconds")


def _iso_date(d: date | None) -> str | None:
    return None if d is None else d.isoformat()
