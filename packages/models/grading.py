"""T-160/T-161: automated grading + regrading (Contract §7, NEVER-CUT per CLAUDE.md §2.2).

On ResultFinal: compute log loss / RPS / Brier / correct for the OFFICIAL forecast, write
`prediction_grade`, append `Graded`. Result corrections bump `match.result_version`; regrading
appends a NEW grade for the new version (original retained forever) and a `Regraded` event;
metrics always use the latest grade per prediction. Only official, non-voided forecasts are
ever graded; drafts never.
"""

from __future__ import annotations

from datetime import UTC, datetime

import psycopg

from models.ledger import append_event, latest_official
from models.metrics import brier_match, log_loss_match, rps_match


def grade_match(conn: psycopg.Connection, match_id: int) -> int | None:
    """Grade the current official forecast against the match's final result.
    Idempotent per (prediction, result_version). Returns prediction_grade_id or None."""
    row = conn.execute(
        "SELECT result, result_version FROM match"
        " WHERE match_id = %s AND result IS NOT NULL AND status = 'final'",
        (match_id,),
    ).fetchone()
    if row is None:
        return None  # result not final yet — stays pending, regraded on arrival
    outcome, result_version = str(row[0]), int(row[1])

    prediction_id = latest_official(conn, match_id)
    if prediction_id is None:
        return None  # honest "no forecast issued" — nothing to grade

    probs_row = conn.execute(
        "SELECT p_home, p_draw, p_away FROM prediction WHERE prediction_id = %s",
        (prediction_id,),
    ).fetchone()
    assert probs_row is not None
    p = (float(probs_row[0]), float(probs_row[1]), float(probs_row[2]))

    existing = conn.execute(
        "SELECT prediction_grade_id FROM prediction_grade"
        " WHERE prediction_id = %s AND result_version = %s",
        (prediction_id, result_version),
    ).fetchone()
    if existing is not None:
        return None  # this (prediction, result_version) already graded — idempotent

    is_regrade = (
        conn.execute(
            "SELECT count(*) FROM prediction_grade WHERE prediction_id = %s",
            (prediction_id,),
        ).fetchone()[0]  # type: ignore[index]
        > 0
    )
    grade_row = conn.execute(
        "INSERT INTO prediction_grade (prediction_id, result_version, log_loss, rps, brier,"
        " correct, graded_at_utc) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING prediction_grade_id",
        (
            prediction_id,
            result_version,
            log_loss_match(p, outcome),
            rps_match(p, outcome),
            brier_match(p, outcome),
            p.index(max(p)) == ("H", "D", "A").index(outcome),
            datetime.now(UTC),
        ),
    ).fetchone()
    assert grade_row is not None
    append_event(conn, match_id, "Regraded" if is_regrade else "Graded", prediction_id)
    return int(grade_row[0])


def grade_all_pending(conn: psycopg.Connection) -> int:
    """The 2-hourly grading job: grade every final match whose current official forecast has
    no grade for the current result_version."""
    rows = conn.execute(
        "SELECT DISTINCT m.match_id FROM match m JOIN prediction p USING (match_id)"
        " WHERE m.result IS NOT NULL AND m.status = 'final' AND p.is_official"
        "   AND NOT EXISTS (SELECT 1 FROM prediction_grade g"
        "                   WHERE g.prediction_id = p.prediction_id"
        "                     AND g.result_version = m.result_version)"
    ).fetchall()
    graded = 0
    for (match_id,) in rows:
        if grade_match(conn, int(match_id)) is not None:
            graded += 1
    return graded


def apply_result_correction(
    conn: psycopg.Connection, match_id: int, home_goals: int, away_goals: int
) -> int:
    """T-161: results are append-only via result_version; the forecast is never altered.
    Returns the new result_version. Follow with grade_match() to produce the Regraded grade."""
    result = "H" if home_goals > away_goals else "A" if home_goals < away_goals else "D"
    row = conn.execute(
        "UPDATE match SET home_goals=%s, away_goals=%s, result=%s,"
        " result_version = result_version + 1 WHERE match_id=%s RETURNING result_version",
        (home_goals, away_goals, result, match_id),
    ).fetchone()
    assert row is not None
    append_event(conn, match_id, "Corrected", details=f'{{"new_version": {int(row[0])}}}')
    return int(row[0])


def latest_grades(conn: psycopg.Connection) -> list[tuple[int, float, float, float, bool]]:
    """(prediction_id, log_loss, rps, brier, correct) using the LATEST grade per prediction."""
    rows = conn.execute(
        "SELECT DISTINCT ON (prediction_id) prediction_id, log_loss, rps, brier, correct"
        " FROM prediction_grade ORDER BY prediction_id, result_version DESC"
    ).fetchall()
    return [(int(r[0]), float(r[1]), float(r[2]), float(r[3]), bool(r[4])) for r in rows]
