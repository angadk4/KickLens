"""T-150 + T-151 + T-132: batch inference with idempotency/state-gating and finalization.

Hourly job semantics (Contract §9): for any RS fixture whose T-3h cutoff has passed but which
has no official forecast and has not kicked off — finalize: build features as-of cutoff,
predict with the READ-ONLY production model, calibrate, record full lineage, write the
write-once official forecast (hash + anchor + events). Re-runs are no-ops (idempotency key +
advisory lock). Freshness > 36h tags stale_inputs=true (forecast still issued + flagged).
Draft forecasts for fixtures inside the 7-day window are overwritable and never hashed/graded.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta

import psycopg
from common.config import load_settings
from common.db import advisory_lock, claim_job, finish_job
from common.hashing import ForecastFields
from features.engine import CUTOFF_BEFORE_KICKOFF, MatchInput, build_features_for_upcoming

from models.calibration import TemperatureCalibrator
from models.ledger import Lineage, latest_official, record_prediction_run, write_official_forecast
from models.logistic import LogisticModel
from models.registry import get_production_version, load_artifact
from models.runlog import code_commit, lockfile_hash
from models.walkforward import Sample, week_key

FRESHNESS_LIMIT = timedelta(hours=36)
DRAFT_WINDOW = timedelta(days=7)
SEED = 42


@dataclass(frozen=True)
class FixtureDue:
    match_id: int
    season_id: int
    season_year: int
    league_id: int
    kickoff_utc: datetime
    home_team_id: int
    away_team_id: int
    neutral_site: bool
    fixture_revision: int


def _fixture(conn: psycopg.Connection, match_id: int) -> FixtureDue:
    row = conn.execute(
        "SELECT m.season_id, s.year, s.league_id, m.kickoff_utc, m.home_team_id,"
        " m.away_team_id, m.neutral_site,"
        " COALESCE((SELECT max(sf.fixture_revision) FROM source_fixture sf"
        "           WHERE sf.match_id = m.match_id), 0)"
        " FROM match m JOIN season s USING (season_id) WHERE m.match_id = %s",
        (match_id,),
    ).fetchone()
    assert row is not None
    return FixtureDue(
        match_id=match_id,
        season_id=int(row[0]),
        season_year=int(row[1]),
        league_id=int(row[2]),
        kickoff_utc=row[3],
        home_team_id=int(row[4]),
        away_team_id=int(row[5]),
        neutral_site=bool(row[6]),
        fixture_revision=int(row[7]),
    )


def fixtures_due(conn: psycopg.Connection, now: datetime) -> list[int]:
    """T-151 state gate: RS fixtures whose cutoff has passed, not kicked off, no official."""
    rows = conn.execute(
        "SELECT m.match_id FROM match m WHERE m.is_regular_season AND m.result IS NULL"
        "   AND m.kickoff_utc IS NOT NULL AND m.kickoff_utc - interval '3 hours' <= %s"
        "   AND m.kickoff_utc > %s ORDER BY m.kickoff_utc",
        (now, now),
    ).fetchall()
    return [
        int(r[0])
        for r in rows
        if latest_official(conn, int(r[0])) is None  # supersession-aware
    ]


def _completed_history(conn: psycopg.Connection) -> list[MatchInput]:
    rows = conn.execute(
        "SELECT m.match_id, s.year, m.kickoff_utc, m.home_team_id, m.away_team_id,"
        " m.home_goals, m.away_goals, m.neutral_site"
        " FROM match m JOIN season s USING (season_id)"
        " WHERE m.is_regular_season AND m.result IS NOT NULL AND m.kickoff_utc IS NOT NULL"
        " ORDER BY m.kickoff_utc, m.match_id"
    ).fetchall()
    return [
        MatchInput(
            int(r[0]), int(r[1]), r[2], int(r[3]), int(r[4]), int(r[5]), int(r[6]), bool(r[7])
        )
        for r in rows
    ]


def data_freshness(conn: psycopg.Connection) -> datetime | None:
    """Time of the last successful results ingest (live: source_fixture; else snapshot)."""
    row = conn.execute(
        "SELECT greatest((SELECT max(fetched_at_utc) FROM source_fixture),"
        " (SELECT max(created_at_utc) FROM dataset_snapshot))"
    ).fetchone()
    return None if row is None else row[0]


def finalize_fixture(conn: psycopg.Connection, match_id: int, now: datetime) -> int | None:
    """T-132: produce the official forecast for one due fixture. Returns prediction_id,
    or None when gated out (already official / not due / another worker holds the claim)."""
    fx = _fixture(conn, match_id)
    cutoff = fx.kickoff_utc - CUTOFF_BEFORE_KICKOFF
    if not (cutoff <= now < fx.kickoff_utc) or latest_official(conn, match_id) is not None:
        return None

    key = f"finalize:{match_id}:rev{fx.fixture_revision}:{cutoff.isoformat()}"
    job_id = claim_job(conn, "finalize", key)
    if job_id is None:
        return None  # idempotency: someone already did/is doing this cutoff+revision

    with advisory_lock(conn, f"inference:league:{fx.league_id}", wait=True):
        prod = get_production_version(conn, fx.league_id)
        if prod is None:
            finish_job(conn, job_id, status="no-production-model")
            raise RuntimeError("no production model_version promoted for this league")
        model_version_id, model_uri, cal_uri = prod
        model: LogisticModel = load_artifact(model_uri)  # READ-ONLY registry use
        calibrator: TemperatureCalibrator = (
            load_artifact(cal_uri)
            if cal_uri
            else TemperatureCalibrator(1.0, fitted=False, reason="none")
        )

        frow = build_features_for_upcoming(
            _completed_history(conn),
            match_id=match_id,
            season_year=fx.season_year,
            kickoff_utc=fx.kickoff_utc,
            home_team_id=fx.home_team_id,
            away_team_id=fx.away_team_id,
            neutral_site=fx.neutral_site,
        )
        db_row = conn.execute(
            "INSERT INTO feature_row (match_id, feature_set_version, as_of_utc,"
            " computed_at_utc, features, inputs_hash) VALUES (%s,%s,%s,%s,%s,%s)"
            " ON CONFLICT (match_id, feature_set_version, as_of_utc) DO UPDATE"
            "   SET computed_at_utc = EXCLUDED.computed_at_utc"
            " RETURNING feature_row_id",
            (
                match_id,
                frow.feature_set_version,
                frow.as_of_utc,
                now,
                json.dumps(frow.features),
                frow.inputs_hash,
            ),
        ).fetchone()
        assert db_row is not None
        feature_row_id = int(db_row[0])

        sample = Sample(
            match_id=match_id,
            season_year=fx.season_year,
            kickoff_utc=fx.kickoff_utc,
            week=week_key(fx.kickoff_utc),
            features=frow.features,
            outcome="H",
            home_team_id=fx.home_team_id,
            away_team_id=fx.away_team_id,
            home_goals=0,
            away_goals=0,
        )  # outcome/goals unused by predict()
        probs = calibrator.apply(model.predict(sample))

        freshness = data_freshness(conn) or now
        stale = (now - freshness) > FRESHNESS_LIMIT
        run_id = record_prediction_run(
            conn,
            Lineage(
                match_id=match_id,
                cutoff_utc=cutoff,
                feature_row_id=feature_row_id,
                feature_set_version=frow.feature_set_version,
                dataset_snapshot_id=None,
                data_freshness_time_utc=freshness,
                stale_inputs=stale,
                model_version_id=model_version_id,
                code_git_sha=code_commit(),
                seed=SEED,
                lockfile_hash=lockfile_hash(),
                market_snapshot_id=None,
                inputs_hash=frow.inputs_hash,
            ),
        )
        fields = ForecastFields(
            match_id=match_id,
            fixture_revision=fx.fixture_revision,
            model_version_id=model_version_id,
            calibration_artifact_id=None,
            feature_set_version=frow.feature_set_version,
            p_home=probs[0],
            p_draw=probs[1],
            p_away=probs[2],
            cutoff_utc=cutoff.isoformat(),
            forecast_creation_utc=now.isoformat(),
            data_freshness_time=freshness.isoformat(),
        )
        prediction_id, _h = write_official_forecast(
            conn,
            prediction_run_id=run_id,
            match_id=match_id,
            kickoff_utc=fx.kickoff_utc,
            fixture_revision=fx.fixture_revision,
            probs=probs,
            cutoff_utc=cutoff,
            fields_for_hash=fields,
            now=now,
        )
        # T-261: publish the anchor to the public repo BEFORE kickoff. A push failure never
        # blocks the forecast (frozen fail-stop): it is retried, then logged as an event.
        from common.anchor import AnchorPushError, publish_anchor

        from models.ledger import append_event

        settings = load_settings(dotenv_path=None)
        try:
            pushed = publish_anchor(
                fields,
                token=settings.github_anchor_token,
                repo=settings.github_anchor_repo,
                anchored_at=now,
            )
            if pushed:
                append_event(conn, match_id, "AnchorPublished", prediction_id)
        except AnchorPushError as exc:
            print(f"ANCHOR-PUSH-FAILED match={match_id}: {exc}")
            append_event(conn, match_id, "AnchorPushFailed", prediction_id, details=None)
        finish_job(conn, job_id)
        return prediction_id


def generate_draft(conn: psycopg.Connection, match_id: int, now: datetime) -> bool:
    """Overwritable preliminary forecast for fixtures inside the 7-day window.
    Never hashed, never graded, refreshed daily (Contract A-drafts)."""
    fx = _fixture(conn, match_id)
    if not (now < fx.kickoff_utc <= now + DRAFT_WINDOW):
        return False
    prod = get_production_version(conn, fx.league_id)
    if prod is None:
        return False
    model_version_id, model_uri, cal_uri = prod
    model: LogisticModel = load_artifact(model_uri)
    calibrator: TemperatureCalibrator = (
        load_artifact(cal_uri) if cal_uri else TemperatureCalibrator(1.0, False, "none")
    )
    frow = build_features_for_upcoming(
        _completed_history(conn),
        match_id=match_id,
        season_year=fx.season_year,
        kickoff_utc=fx.kickoff_utc,
        home_team_id=fx.home_team_id,
        away_team_id=fx.away_team_id,
        neutral_site=fx.neutral_site,
    )
    sample = Sample(
        match_id=match_id,
        season_year=fx.season_year,
        kickoff_utc=fx.kickoff_utc,
        week=week_key(fx.kickoff_utc),
        features=frow.features,
        outcome="H",
        home_team_id=fx.home_team_id,
        away_team_id=fx.away_team_id,
        home_goals=0,
        away_goals=0,
    )
    p = calibrator.apply(model.predict(sample))
    conn.execute(
        "INSERT INTO draft_prediction (match_id, model_version_id, p_home, p_draw, p_away,"
        " generated_at_utc) VALUES (%s,%s,%s,%s,%s,%s)"
        " ON CONFLICT (match_id) DO UPDATE SET p_home=EXCLUDED.p_home,"
        " p_draw=EXCLUDED.p_draw, p_away=EXCLUDED.p_away,"
        " generated_at_utc=EXCLUDED.generated_at_utc, model_version_id=EXCLUDED.model_version_id",
        (match_id, model_version_id, p[0], p[1], p[2], now),
    )
    return True
