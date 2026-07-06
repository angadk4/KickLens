"""T-100 tests: sum-to-one, T~=1 on calibrated input, floor fallback, degenerate handling."""

import math
import random

import pytest
from models.calibration import Probs, TemperatureCalibrator, fit_temperature


def _synthetic(n: int, sharpen: float, seed: int = 7) -> tuple[list[Probs], list[str]]:
    """True probs drawn per match; outcomes sampled from them; reported probs sharpened
    (sharpen < 1 means overconfident reports -> fitted T should be > 1)."""
    rng = random.Random(seed)
    probs: list[Probs] = []
    outcomes: list[str] = []
    for _ in range(n):
        a, b, c = (rng.uniform(0.2, 1.0) for _ in range(3))
        s = a + b + c
        true = (a / s, b / s, c / s)
        outcomes.append(rng.choices(["H", "D", "A"], weights=true)[0])
        z = [q ** (1.0 / sharpen) for q in true]
        zs = sum(z)
        probs.append((z[0] / zs, z[1] / zs, z[2] / zs))
    return probs, outcomes


def test_apply_sums_to_one_and_orders_preserved() -> None:
    cal = TemperatureCalibrator(temperature=2.0, fitted=True, reason="ok")
    q = cal.apply((0.7, 0.2, 0.1))
    assert sum(q) == pytest.approx(1.0)
    assert q[0] > q[1] > q[2]  # order preserved
    assert q[0] < 0.7  # T > 1 softens confidence


def test_fitted_temperature_recovers_overconfidence() -> None:
    probs, outcomes = _synthetic(2000, sharpen=0.5)  # overconfident reports
    cal = fit_temperature(probs, outcomes)
    assert cal.fitted and cal.temperature > 1.2


def test_calibrated_input_yields_t_near_one() -> None:
    probs, outcomes = _synthetic(4000, sharpen=1.0)
    cal = fit_temperature(probs, outcomes)
    assert cal.fitted and 0.8 < cal.temperature < 1.25


def test_floor_fallback_below_150_matches_or_30_draws() -> None:
    probs, outcomes = _synthetic(100, sharpen=1.0)
    cal = fit_temperature(probs, outcomes)
    assert not cal.fitted and cal.reason == "slice-below-floor"
    assert cal.apply((0.5, 0.3, 0.2)) == (0.5, 0.3, 0.2)  # raw passthrough
    no_draws = fit_temperature([(0.5, 0.3, 0.2)] * 200, ["H"] * 200)
    assert not no_draws.fitted and no_draws.reason == "slice-below-floor"


def test_degenerate_fit_falls_back_raw() -> None:
    # ALWAYS-right, mildly-confident reports: sharpening (T -> 0) always improves NLL,
    # so the fit slams into the lower bound -> declared degenerate -> raw fallback
    probs: list[Probs] = [(0.8, 0.1, 0.1)] * 170 + [(0.1, 0.8, 0.1)] * 30
    outcomes = ["H"] * 170 + ["D"] * 30
    cal = fit_temperature(probs, outcomes)
    assert not cal.fitted and cal.reason == "degenerate-fit"


def test_apply_is_noop_when_not_fitted_or_t_equals_one() -> None:
    raw = TemperatureCalibrator(1.0, fitted=True, reason="ok")
    p = (0.4, 0.35, 0.25)
    assert raw.apply(p) == p
    q = TemperatureCalibrator(3.0, fitted=True, reason="ok").apply(p)
    assert math.isclose(sum(q), 1.0)
