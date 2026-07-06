"""T-090: multinomial logistic champion candidate (Contract §6.3 / Protocol §4 F-sets).

L2-regularized multinomial logistic on fs-v1 feature subsets F0-F4; standardization (mean/var)
fit per fold on the training window ONLY (Protocol §3A). Deterministic (lbfgs, fixed seed).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np
from sklearn.linear_model import LogisticRegression  # type: ignore[import-untyped]
from sklearn.preprocessing import StandardScaler  # type: ignore[import-untyped]

from models.walkforward import Sample

Probs = tuple[float, float, float]

# Protocol §4 feature-set registry (fs-v1 keys; intercept comes from the model itself)
F_SETS: dict[str, tuple[str, ...]] = {
    "F0": ("neutral_site",),
    "F1": ("neutral_site", "elo_diff"),
    "F2": (
        "neutral_site",
        "elo_diff",
        "form5_pts_home",
        "form5_pts_away",
        "form10_pts_home",
        "form10_pts_away",
        "form5_gd_home",
        "form5_gd_away",
        "form10_gd_home",
        "form10_gd_away",
        "home_form5_pts",
        "away_form5_pts",
    ),
    "F3": (
        "neutral_site",
        "elo_diff",
        "form5_pts_home",
        "form5_pts_away",
        "form10_pts_home",
        "form10_pts_away",
        "form5_gd_home",
        "form5_gd_away",
        "form10_gd_home",
        "form10_gd_away",
        "home_form5_pts",
        "away_form5_pts",
        "rest_days_home",
        "rest_days_away",
        "congestion_home",
        "congestion_away",
    ),
    "F4": (
        "neutral_site",
        "elo_diff",
        "form5_pts_home",
        "form5_pts_away",
        "form10_pts_home",
        "form10_pts_away",
        "form5_gd_home",
        "form5_gd_away",
        "form10_gd_home",
        "form10_gd_away",
        "home_form5_pts",
        "away_form5_pts",
        "rest_days_home",
        "rest_days_away",
        "congestion_home",
        "congestion_away",
        "season_progress",
        "cold_start_home",
        "cold_start_away",
    ),
}

C_GRID = (0.01, 0.1, 1.0, 10.0)
_CLASSES = ("H", "D", "A")


@dataclass
class LogisticModel:
    f_set: str
    c: float
    seed: int = 42
    name: str = ""
    _scaler: StandardScaler | None = field(default=None, repr=False)
    _clf: LogisticRegression | None = field(default=None, repr=False)
    _class_order: list[int] = field(default_factory=list, repr=False)

    def __post_init__(self) -> None:
        self.name = self.name or f"logistic-{self.f_set}-C{self.c}"

    def _matrix(self, samples: Sequence[Sample]) -> np.ndarray:
        keys = F_SETS[self.f_set]
        return np.array([[s.features[k] for k in keys] for s in samples], dtype=float)

    def fit(self, train: Sequence[Sample]) -> None:
        x = self._matrix(train)
        y = np.array([_CLASSES.index(s.outcome) for s in train])
        self._scaler = StandardScaler().fit(x)  # train window ONLY (leakage lock)
        self._clf = LogisticRegression(C=self.c, max_iter=2000, random_state=self.seed).fit(
            self._scaler.transform(x), y
        )
        self._class_order = [int(c) for c in self._clf.classes_]

    def predict(self, s: Sample) -> Probs:
        assert self._clf is not None and self._scaler is not None
        x = self._scaler.transform(self._matrix([s]))
        raw = self._clf.predict_proba(x)[0]
        p = [0.0, 0.0, 0.0]
        for pos, cls in enumerate(self._class_order):
            p[cls] = float(raw[pos])
        return (p[0], p[1], p[2])
