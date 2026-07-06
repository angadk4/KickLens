"""T-120 + T-130: prediction_run lineage capture and the write-once forecast ledger.

Contract §7: the official `prediction` row is INSERT-only (DB triggers + T-022 app guard);
all state changes append to `prediction_event`; a post-kickoff official write is REJECTED
(an honest "no forecast issued" beats a back-filled one); postponement after freeze voids the
old official (event appended, row retained forever) and a NEW official is created at the new
T-3h.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import psycopg
from common.hashing import ForecastFields, append_anchor, forecast_hash


class PostKickoffWriteRejected(RuntimeError):
    """An official forecast may never be created at or after kickoff."""


@dataclass(frozen=True)
class Lineage:
    """T-120: everything a prediction_run must record (Contract §7 field set)."""

    match_id: int
    cutoff_utc: datetime
    feature_row_id: int
    feature_set_version: str
    dataset_snapshot_id: int | None
    data_freshness_time_utc: datetime
    stale_inputs: bool
    model_version_id: int
    code_git_sha: str
    seed: int
    lockfile_hash: str
    market_snapshot_id: int | None
    inputs_hash: str


def record_prediction_run(conn: psycopg.Connection, lin: Lineage) -> int:
    row = conn.execute(
        "INSERT INTO prediction_run (match_id, cutoff_utc, feature_row_id,"
        " feature_set_version, dataset_snapshot_id, data_freshness_time_utc, stale_inputs,"
        " model_version_id, code_git_sha, seed, lockfile_hash, market_snapshot_id,"
        " inputs_hash, created_at_utc)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING prediction_run_id",
        (
            lin.match_id,
            lin.cutoff_utc,
            lin.feature_row_id,
            lin.feature_set_version,
            lin.dataset_snapshot_id,
            lin.data_freshness_time_utc,
            lin.stale_inputs,
            lin.model_version_id,
            lin.code_git_sha,
            lin.seed,
            lin.lockfile_hash,
            lin.market_snapshot_id,
            lin.inputs_hash,
            datetime.now(UTC),
        ),
    ).fetchone()
    assert row is not None
    return int(row[0])


def append_event(
    conn: psycopg.Connection,
    match_id: int,
    event_type: str,
    prediction_id: int | None = None,
    details: str | None = None,
) -> int:
    row = conn.execute(
        "INSERT INTO prediction_event (prediction_id, match_id, event_type, event_time_utc,"
        " details) VALUES (%s,%s,%s,%s,%s) RETURNING prediction_event_id",
        (prediction_id, match_id, event_type, datetime.now(UTC), details),
    ).fetchone()
    assert row is not None
    return int(row[0])


def write_official_forecast(
    conn: psycopg.Connection,
    *,
    prediction_run_id: int,
    match_id: int,
    kickoff_utc: datetime,
    fixture_revision: int,
    probs: tuple[float, float, float],
    cutoff_utc: datetime,
    fields_for_hash: ForecastFields,
    now: datetime | None = None,
) -> tuple[int, str]:
    """Create the write-once official forecast: reject post-kickoff, hash, anchor, log events.
    Returns (prediction_id, forecast_hash)."""
    creation = now or datetime.now(UTC)
    if creation >= kickoff_utc:
        raise PostKickoffWriteRejected(
            f"refusing official forecast for match {match_id}: creation {creation} >= "
            f"kickoff {kickoff_utc} (no post-kickoff back-fill, Contract §7)"
        )
    h = forecast_hash(fields_for_hash)
    row = conn.execute(
        "INSERT INTO prediction (match_id, prediction_run_id, fixture_revision, p_home,"
        " p_draw, p_away, cutoff_utc, forecast_creation_utc, is_official, forecast_hash,"
        " anchored_at_utc) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,true,%s,%s)"
        " RETURNING prediction_id",
        (
            match_id,
            prediction_run_id,
            fixture_revision,
            probs[0],
            probs[1],
            probs[2],
            cutoff_utc,
            creation,
            h,
            creation,
        ),
    ).fetchone()
    assert row is not None
    prediction_id = int(row[0])
    append_anchor(fields_for_hash, now=creation)
    append_event(conn, match_id, "OfficialFinalized", prediction_id)
    append_event(conn, match_id, "OfficialFrozen", prediction_id)
    return prediction_id, h


def void_official(conn: psycopg.Connection, prediction_id: int, match_id: int, reason: str) -> None:
    """Supersession (postponement after freeze): append Voided; the row stays forever.
    A NEW official forecast is then produced at the new T-3h by the finalization job."""
    append_event(conn, match_id, "Voided", prediction_id, details=f'{{"reason": "{reason}"}}')


def latest_official(conn: psycopg.Connection, match_id: int) -> int | None:
    """The current official = newest official prediction without a Voided event."""
    row = conn.execute(
        "SELECT p.prediction_id FROM prediction p"
        " WHERE p.match_id = %s AND p.is_official"
        "   AND NOT EXISTS (SELECT 1 FROM prediction_event e"
        "                   WHERE e.prediction_id = p.prediction_id AND e.event_type='Voided')"
        " ORDER BY p.forecast_creation_utc DESC LIMIT 1",
        (match_id,),
    ).fetchone()
    return None if row is None else int(row[0])
