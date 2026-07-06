"""THE FROZEN CHAMPION RECIPE — selection sealed 2026-07-06 (developer-approved).

Protocol §14 "Selection sealed": no further tuning is possible. Any change to these values
after this point requires a new MAJOR protocol version and a new reserved test season.
Evidence: docs/selection.md; run trail: experiments/runs.jsonl (selection-report).

Downstream consumers (training, finalization job, model card) import from HERE — never
re-specify the recipe.
"""

from __future__ import annotations

from collections.abc import Sequence

from models.baselines import B3EloOrdinal
from models.calibration import TemperatureCalibrator, fit_temperature
from models.logistic import LogisticModel
from models.walkforward import Sample

FROZEN_AT = "2026-07-06"
CHAMPION_NAME = "logistic-F1-C0.1+temperature"
F_SET = "F1"  # {elo_diff, neutral_site} + intercepts
C = 0.1
CALIBRATION = "temperature"  # per-fold/per-training trailing-20% slice; raw fallback
SEED = 42
# Pre-registered fallback if the champion fails OOT (Protocol §14): the best baseline.
FALLBACK_NAME = "B3-elo-ordinal"

# Dev evidence at freeze (2018-2024 walk-forward, 210 folds / 3,012 matches):
DEV_LOG_LOSS = 1.0346
DEV_ECE = 0.0108
DEV_NOTE = (
    "statistically equivalent to B3 (diff +0.0001 [-0.0030, +0.0030]); "
    "no superiority claim; market reference 1.0149 (+0.0197 stronger-information gap)"
)


def make_champion() -> LogisticModel:
    return LogisticModel(f_set=F_SET, c=C, seed=SEED)


def make_fallback() -> B3EloOrdinal:
    return B3EloOrdinal()


def fit_champion_with_calibration(
    train: Sequence[Sample], calibration_slice: Sequence[Sample]
) -> tuple[LogisticModel, TemperatureCalibrator]:
    """The frozen training procedure: fit on the window, temperature on the trailing slice."""
    model = make_champion()
    model.fit(train)
    slice_probs = [model.predict(s) for s in calibration_slice]
    slice_outcomes = [s.outcome for s in calibration_slice]
    return model, fit_temperature(slice_probs, slice_outcomes)
