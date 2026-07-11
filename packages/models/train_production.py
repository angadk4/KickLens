"""E27/T-121: train the production model on the FULL era and register it.

The recipe is frozen (`models.champion`): logistic F1 (elo_diff + neutral_site), C=0.1, with
temperature calibration on the trailing-20% slice. This script only assembles that recipe over
all available regular-season data (2017 through the latest completed season) and writes the
artifacts + a promotable `model_version`.

Ordering guard (integrity): the LAUNCH production model may only be trained AFTER the touch-once
2025 test has run (its immutable output exists). This mechanically enforces "freeze -> test once
-> then production/launch" so the deploy model can never be produced ahead of the sealed test.
The monthly retrain (post-launch challenger) passes require_final_test=False.

Run (launch bootstrap): uv run python -m models.train_production --promote
Run (monthly challenger): invoked by .github/workflows/train.yml (no --promote)
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from common.config import load_settings

from models.champion import CHAMPION_NAME, F_SET, SEED, C, fit_champion_with_calibration
from models.registry import (
    DEFAULT_ARTIFACT_ROOT,
    create_training_run,
    register_model_version,
    save_calibration_artifact,
    save_model_artifact,
)
from models.runlog import code_commit, lockfile_hash
from models.walkforward import CALIBRATION_SLICE_FRACTION, Sample, week_key

FINAL_TEST_OUTPUT = Path("experiments/final_test_2025.json")


class TrainingOrderError(RuntimeError):
    """Refusing to train the launch production model before the touch-once test has run."""


@dataclass(frozen=True)
class TrainResult:
    model_version_id: int
    n_matches: int
    temperature: float | None
    promoted: bool


def _load_production_samples(conn: psycopg.Connection) -> list[Sample]:
    """All completed regular-season matches with fs-v1 features, 2017 onward (incl. 2025+)."""
    rows = conn.execute(
        "SELECT m.match_id, s.year, m.kickoff_utc, f.features, m.result,"
        " m.home_team_id, m.away_team_id, m.home_goals, m.away_goals"
        " FROM feature_row f JOIN match m USING (match_id) JOIN season s USING (season_id)"
        " WHERE f.feature_set_version = 'fs-v1' AND m.is_regular_season"
        "   AND m.result IS NOT NULL AND s.year >= 2017"
        " ORDER BY m.kickoff_utc, m.match_id"
    ).fetchall()
    return [
        Sample(
            match_id=int(r[0]),
            season_year=int(r[1]),
            kickoff_utc=r[2],
            week=week_key(r[2]),
            features=r[3],
            outcome=str(r[4]),
            home_team_id=int(r[5]),
            away_team_id=int(r[6]),
            home_goals=int(r[7]),
            away_goals=int(r[8]),
        )
        for r in rows
    ]


def _dataset_snapshot(conn: psycopg.Connection, samples: list[Sample]) -> int:
    """A snapshot of exactly the training match set (content-addressed)."""
    ids = ",".join(str(s.match_id) for s in samples)
    h = hashlib.sha256(ids.encode()).hexdigest()
    row = conn.execute(
        "INSERT INTO dataset_snapshot (snapshot_hash, row_count, date_range_start,"
        " date_range_end, created_at_utc) VALUES (%s,%s,%s,%s,%s)"
        " ON CONFLICT (snapshot_hash) DO UPDATE SET row_count = EXCLUDED.row_count"
        " RETURNING dataset_snapshot_id",
        (
            f"prod-{h[:16]}",
            len(samples),
            samples[0].kickoff_utc.date(),
            samples[-1].kickoff_utc.date(),
            datetime.now(UTC),
        ),
    ).fetchone()
    assert row is not None
    return int(row[0])


def train_production(
    conn: psycopg.Connection,
    *,
    promote_it: bool = False,
    require_final_test: bool = True,
    artifact_root: Path = DEFAULT_ARTIFACT_ROOT,
) -> TrainResult:
    if require_final_test and not FINAL_TEST_OUTPUT.exists():
        raise TrainingOrderError(
            f"{FINAL_TEST_OUTPUT} not found — run the touch-once 2025 test first "
            "(models.run_final_test); the launch model trains only after the sealed test"
        )
    samples = _load_production_samples(conn)
    if not samples:
        raise RuntimeError("no fs-v1 samples found — load history + build features first")

    # frozen training procedure: fit on all-but-slice, temperature on the trailing slice
    k = max(1, round(CALIBRATION_SLICE_FRACTION * len(samples)))
    model, calibrator = fit_champion_with_calibration(samples, samples[-k:])

    league_id = int(
        conn.execute("SELECT league_id FROM league WHERE code = 'MLS'").fetchone()[0]  # type: ignore[index]
    )
    snapshot_id = _dataset_snapshot(conn, samples)
    training_run_id = create_training_run(
        conn,
        dataset_snapshot_id=snapshot_id,
        code_git_sha=code_commit(),
        seed=SEED,
        lockfile_hash=lockfile_hash(),
        params=f'{{"champion": "{CHAMPION_NAME}", "f_set": "{F_SET}", "C": {C}}}',
    )
    model_artifact_id = save_model_artifact(conn, training_run_id, model, root=artifact_root)
    calibration_artifact_id = save_calibration_artifact(
        conn,
        training_run_id,
        calibrator,
        param_t=calibrator.temperature if calibrator.fitted else None,
        root=artifact_root,
    )
    label = f"{F_SET}-C{C}-{datetime.now(UTC):%Y%m%d}"
    model_version_id = register_model_version(
        conn,
        league_id=league_id,
        model_artifact_id=model_artifact_id,
        calibration_artifact_id=calibration_artifact_id,
        version_label=label,
    )
    if promote_it:
        from models.registry import promote

        promote(conn, model_version_id)
    return TrainResult(
        model_version_id=model_version_id,
        n_matches=len(samples),
        temperature=calibrator.temperature if calibrator.fitted else None,
        promoted=promote_it,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--promote", action="store_true", help="set this model_version as production")
    ap.add_argument(
        "--allow-before-final-test",
        action="store_true",
        help="monthly-challenger use ONLY; the launch bootstrap must NOT set this",
    )
    args = ap.parse_args()
    with psycopg.connect(load_settings().database_url) as conn:
        result = train_production(
            conn, promote_it=args.promote, require_final_test=not args.allow_before_final_test
        )
        conn.commit()
    print(
        f"[train_production] model_version={result.model_version_id} "
        f"n={result.n_matches} T={result.temperature} promoted={result.promoted}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
