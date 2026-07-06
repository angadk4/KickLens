"""T-090 tests: config cap, standardization past-only, valid probabilities, determinism."""

from datetime import UTC, datetime, timedelta

import pytest
from models.logistic import C_GRID, F_SETS, LogisticModel
from models.walkforward import Sample, week_key

T0 = datetime(2018, 3, 3, 20, 0, tzinfo=UTC)
FEATURE_KEYS = F_SETS["F4"]


def sample(mid: int, days: float, outcome: str, elo: float) -> Sample:
    ko = T0 + timedelta(days=days)
    feats = dict.fromkeys(FEATURE_KEYS, 0.5)
    feats["elo_diff"] = elo
    return Sample(
        match_id=mid,
        season_year=2018,
        kickoff_utc=ko,
        week=week_key(ko),
        features=feats,
        outcome=outcome,
        home_team_id=1,
        away_team_id=2,
        home_goals=1,
        away_goals=0,
    )


def _train() -> list[Sample]:
    out = []
    for i in range(90):
        outcome = ("H", "D", "A")[i % 3]
        elo = {"H": 80.0, "D": 0.0, "A": -80.0}[outcome] + (i % 7)
        out.append(sample(i + 1, i, outcome, elo))
    return out


def test_config_cap_at_most_20() -> None:
    assert len(F_SETS) * len(C_GRID) <= 20


def test_f_sets_are_nested() -> None:
    import itertools

    order = ["F0", "F1", "F2", "F3", "F4"]
    for a, b in itertools.pairwise(order):
        assert set(F_SETS[a]) < set(F_SETS[b])


def test_probabilities_valid_and_deterministic() -> None:
    train = _train()
    target = sample(999, 200, "H", 40.0)
    a, b = LogisticModel("F4", 1.0), LogisticModel("F4", 1.0)
    a.fit(train)
    b.fit(train)
    pa, pb = a.predict(target), b.predict(target)
    assert pa == pb  # deterministic with fixed seed
    assert sum(pa) == pytest.approx(1.0)
    assert all(q > 0 for q in pa)


def test_elo_signal_learned() -> None:
    m = LogisticModel("F1", 1.0)
    m.fit(_train())
    strong = m.predict(sample(901, 200, "H", 150.0))
    weak = m.predict(sample(902, 200, "H", -150.0))
    assert strong[0] > weak[0] and strong[2] < weak[2]


def test_standardization_fit_on_train_only() -> None:
    """Adding an extreme future sample to PREDICTION must not change the scaler; adding it
    to TRAIN must. Proves the scaler state derives from fit() input only."""
    train = _train()
    m = LogisticModel("F1", 1.0)
    m.fit(train)
    assert m._scaler is not None
    mean_before = m._scaler.mean_.copy()
    m.predict(sample(999, 200, "H", 10_000.0))  # extreme value at predict time
    assert (m._scaler.mean_ == mean_before).all()
    m.fit([*train, sample(1000, 250, "H", 10_000.0)])
    assert not (m._scaler.mean_ == mean_before).all()
