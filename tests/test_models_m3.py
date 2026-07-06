"""M3 unit tests: T-081 metrics vs hand-computed, T-080 fold discipline,
T-082 bootstrap determinism, T-070..073 baseline sanity."""

import math
from datetime import UTC, datetime, timedelta

import pytest
from models import metrics as mx
from models.baselines import (
    B0GlobalFloor,
    B1HomeAway,
    B2Expanding,
    B3EloOrdinal,
    B4Poisson,
    BaselineModel,
    b5_dixon_coles,
)
from models.bootstrap import block_bootstrap_mean, is_practical_improvement, paired_diff
from models.walkforward import Sample, make_folds, week_key

T0 = datetime(2018, 3, 3, 20, 0, tzinfo=UTC)


def sample(
    mid: int,
    days: float,
    outcome: str,
    season: int = 2018,
    elo_diff: float = 0.0,
    home: int = 10,
    away: int = 20,
    hg: int = 1,
    ag: int = 1,
) -> Sample:
    ko = T0 + timedelta(days=days)
    return Sample(
        match_id=mid,
        season_year=season,
        kickoff_utc=ko,
        week=week_key(ko),
        features={"elo_diff": elo_diff},
        outcome=outcome,
        home_team_id=home,
        away_team_id=away,
        home_goals=hg,
        away_goals=ag,
    )


# ---------- T-081 metrics vs hand-computed ----------


def test_log_loss_hand_computed() -> None:
    assert mx.log_loss_match((0.5, 0.3, 0.2), "H") == pytest.approx(-math.log(0.5))
    assert mx.log_loss_match((0.5, 0.3, 0.2), "A") == pytest.approx(-math.log(0.2))
    assert mx.log_loss_match((1.0, 0.0, 0.0), "D") == pytest.approx(-math.log(1e-15))


def test_rps_hand_computed() -> None:
    # p=(0.6,0.3,0.1), outcome H: cum diffs (0.6-1)^2 + (0.9-1)^2 = 0.16+0.01 = 0.17 → /2
    assert mx.rps_match((0.6, 0.3, 0.1), "H") == pytest.approx(0.085)
    # perfect forecast → 0
    assert mx.rps_match((1.0, 0.0, 0.0), "H") == pytest.approx(0.0)
    # RPS respects ordering: mass on A is worse than mass on D when H happens
    assert mx.rps_match((0.4, 0.1, 0.5), "H") > mx.rps_match((0.4, 0.5, 0.1), "H")


def test_brier_hand_computed() -> None:
    # p=(0.5,0.3,0.2), H: (0.5-1)^2+0.09+0.04 = 0.38
    assert mx.brier_match((0.5, 0.3, 0.2), "H") == pytest.approx(0.38)


def test_ece_perfectly_calibrated_bins() -> None:
    # 10 matches at max-prob 0.6 with exactly 6 hits → ECE 0
    probs = [(0.6, 0.25, 0.15)] * 10
    outcomes = ["H"] * 6 + ["D", "D", "A", "A"]
    assert mx.ece(probs, outcomes) == pytest.approx(0.0)


def test_accuracy_and_confusion() -> None:
    probs = [(0.7, 0.2, 0.1), (0.1, 0.2, 0.7)]
    outcomes = ["H", "H"]
    assert mx.accuracy(probs, outcomes) == pytest.approx(0.5)
    assert mx.confusion(probs, outcomes)[0] == [1, 0, 1]  # actual H: predicted H once, A once


# ---------- T-080 walk-forward discipline ----------


def _season(mids: range, season: int, start_day: float, outcome: str = "H") -> list[Sample]:
    return [sample(m, start_day + 7 * i, outcome, season=season) for i, m in enumerate(mids)]


def test_folds_expand_and_burn_in_never_evaluated() -> None:
    s2017 = _season(range(1, 6), 2017, 0)
    s2018 = _season(range(6, 11), 2018, 365)
    folds = make_folds(s2017 + s2018)
    assert all(f.block[0].season_year >= 2018 for f in folds)  # 2017 = burn-in only
    # expanding: every fold's train strictly precedes its block; sizes grow
    sizes = [len(f.train) for f in folds]
    assert sizes == sorted(sizes) and sizes[0] == 5
    for f in folds:
        block_start = min(s.kickoff_utc for s in f.block)
        assert all(s.kickoff_utc < block_start for s in f.train)


def test_one_block_per_matchweek() -> None:
    ms = _season(range(1, 9), 2018, 0)
    folds = make_folds(ms, first_eval_season=2018)
    # weekly spacing → one fold per week, each block of size 1 (after the first with no train)
    assert all(len(f.block) == 1 for f in folds)
    keys = [f.block_key for f in folds]
    assert keys == sorted(set(keys))


def test_non_dev_season_is_rejected() -> None:
    with pytest.raises(AssertionError, match="non-dev season"):
        make_folds([sample(1, 0, "H", season=2025)])


def test_calibration_slice_is_trailing_and_flagged_when_small() -> None:
    ms = _season(range(1, 31), 2017, 0) + _season(range(31, 41), 2018, 365)
    folds = make_folds(ms)
    f = folds[-1]
    sl = f.calibration_slice
    assert len(sl) == round(0.2 * len(f.train))
    assert list(sl) == sorted(sl, key=lambda s: s.kickoff_utc)[-len(sl) :]
    assert not f.calibration_slice_sufficient  # tiny fixture → below the ≥150/≥30 floor


# ---------- T-082 bootstrap ----------


def test_bootstrap_deterministic_with_seed_and_ci_brackets_mean() -> None:
    per_block = {(2018, w): [0.9 + 0.01 * (w % 5)] * 8 for w in range(1, 30)}
    a = block_bootstrap_mean(per_block, seed=42)
    b = block_bootstrap_mean(per_block, seed=42)
    c = block_bootstrap_mean(per_block, seed=7)
    assert (a.mean, a.ci_low, a.ci_high) == (b.mean, b.ci_low, b.ci_high)
    assert (a.ci_low, a.ci_high) != (c.ci_low, c.ci_high)  # different seed, different resamples
    assert a.ci_low <= a.mean <= a.ci_high


def test_paired_diff_and_practical_threshold() -> None:
    base = {(2018, w): [1.0] * 5 for w in range(1, 25)}
    better = {(2018, w): [0.99] * 5 for w in range(1, 25)}  # -0.01 everywhere
    d = paired_diff(better, base, seed=42)
    assert d.mean == pytest.approx(-0.01)
    assert is_practical_improvement(d)
    barely = {(2018, w): [0.998] * 5 for w in range(1, 25)}  # -0.002 < threshold
    assert not is_practical_improvement(paired_diff(barely, base, seed=42))


# ---------- T-070..073 baselines ----------


def _train() -> list[Sample]:
    out = []
    mid = 1
    for i in range(60):
        outcome = "H" if i % 2 == 0 else ("D" if i % 4 == 1 else "A")
        out.append(
            sample(
                mid,
                i * 3,
                outcome,
                elo_diff=50.0 if outcome == "H" else -50.0,
                home=10 + (i % 4),
                away=20 + (i % 5),
                hg=2 if outcome == "H" else 1,
                ag=0 if outcome == "H" else 1 if outcome == "D" else 2,
            )
        )
        mid += 1
    return out


def test_all_baselines_sum_to_one_and_positive() -> None:
    train = _train()
    target = sample(999, 500, "H", elo_diff=25.0, home=10, away=21, hg=0, ag=0)
    models: list[BaselineModel] = [
        B0GlobalFloor(),
        B1HomeAway(),
        B2Expanding(all_samples=[*train, target]),
        B3EloOrdinal(),
        B4Poisson(),
        b5_dixon_coles(),
    ]
    for m in models:
        m.fit(train)
        p = m.predict(target)
        assert sum(p) == pytest.approx(1.0, abs=1e-9), m.name
        assert all(q > 0 for q in p), m.name


def test_b0_is_symmetric_floor_and_b1_captures_home_advantage() -> None:
    train = _train()  # H-heavy by construction
    b0, b1 = B0GlobalFloor(), B1HomeAway()
    b0.fit(train)
    b1.fit(train)
    t = train[0]
    assert b0.predict(t)[0] == pytest.approx(b0.predict(t)[2])  # symmetric
    assert b1.predict(t)[0] > b1.predict(t)[2]  # home advantage learned


def test_b2_is_point_in_time() -> None:
    train = _train()
    b2 = B2Expanding(all_samples=train)
    # the first match sees the smoothed uniform prior — nothing before it
    assert b2.predict(train[0]) == pytest.approx((1 / 3, 1 / 3, 1 / 3))


def test_b3_monotonic_in_elo_diff() -> None:
    b3 = B3EloOrdinal()
    b3.fit(_train())
    lo = b3.predict(sample(901, 500, "H", elo_diff=-200.0))
    hi = b3.predict(sample(902, 500, "H", elo_diff=200.0))
    assert hi[0] > lo[0] and hi[2] < lo[2]  # more elo_diff → more P(H), less P(A)


def test_b4_grid_and_unseen_team_fallback() -> None:
    b4 = B4Poisson()
    b4.fit(_train())
    p = b4.predict(sample(903, 500, "H", home=777, away=888, hg=0, ag=0))  # both unseen
    assert sum(p) == pytest.approx(1.0, abs=1e-9)
    assert p[0] > p[2]  # home advantage survives for unseen teams


def test_b5_dc_differs_from_b4_on_low_scores() -> None:
    train = _train()
    b4, b5 = B4Poisson(), b5_dixon_coles()
    b4.fit(train)
    b5.fit(train)
    t = sample(904, 500, "D", home=10, away=21)
    assert b5.name == "B5"
    # rho fitted (usually nonzero) → draw probability differs from independent Poisson
    assert b5.predict(t) != pytest.approx(b4.predict(t))
