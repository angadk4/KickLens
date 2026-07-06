"""T-100: temperature scaling (Contract §6.6 / Protocol §7).

One parameter T > 0 applied in log-space: q_c = p_c^(1/T) / sum_k p_k^(1/T).
Always fitted (A4: the learned T is a diagnostic — T ~= 1 means already calibrated);
fitted per fold on the trailing-20% calibration slice; falls back to RAW probabilities when
the slice misses the >=150-match / >=30-draw floor or the fit is degenerate.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize_scalar

Probs = tuple[float, float, float]

T_BOUNDS = (0.05, 20.0)  # optimizer search range
# plausible calibration temperatures live near 1; a fit outside this band means the input
# probabilities are pathological -> declared degenerate, fallback to raw (Contract A27)
T_PLAUSIBLE = (0.2, 5.0)
_OUTCOME_INDEX = {"H": 0, "D": 1, "A": 2}
_CLIP = 1e-12


@dataclass(frozen=True)
class TemperatureCalibrator:
    temperature: float
    fitted: bool  # False -> fallback: apply() returns probabilities unchanged
    reason: str  # "ok" | "slice-below-floor" | "degenerate-fit"

    def apply(self, p: Probs) -> Probs:
        if not self.fitted or self.temperature == 1.0:
            return p
        logits = [math.log(max(q, _CLIP)) / self.temperature for q in p]
        m = max(logits)
        exp = [math.exp(z - m) for z in logits]
        s = sum(exp)
        return (exp[0] / s, exp[1] / s, exp[2] / s)


def fit_temperature(
    probs: Sequence[Probs],
    outcomes: Sequence[str],
    *,
    floor_matches: int = 150,
    floor_draws: int = 30,
) -> TemperatureCalibrator:
    """Fit T by NLL minimization on the calibration slice; enforce the sample floor."""
    draws = sum(1 for o in outcomes if o == "D")
    if len(probs) < floor_matches or draws < floor_draws:
        return TemperatureCalibrator(1.0, fitted=False, reason="slice-below-floor")

    p = np.clip(np.asarray(probs, dtype=float), _CLIP, None)
    y = np.array([_OUTCOME_INDEX[o] for o in outcomes])
    logp = np.log(p)

    def nll(t: float) -> float:
        z = logp / t
        z -= z.max(axis=1, keepdims=True)
        q = np.exp(z)
        q /= q.sum(axis=1, keepdims=True)
        return float(-np.log(np.clip(q[np.arange(len(y)), y], _CLIP, None)).sum())

    res = minimize_scalar(nll, bounds=T_BOUNDS, method="bounded")
    t = float(res.x)
    if not res.success or not math.isfinite(t) or not (T_PLAUSIBLE[0] < t < T_PLAUSIBLE[1]):
        return TemperatureCalibrator(1.0, fitted=False, reason="degenerate-fit")
    return TemperatureCalibrator(t, fitted=True, reason="ok")
