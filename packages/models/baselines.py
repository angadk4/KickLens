"""T-070..T-073: the baseline ladder B0-B5 (Contract §6.2 / Master Spec §16).

Common interface: `fit(train)` then `predict(sample) -> (pH, pD, pA)`. Every baseline is refit
per walk-forward fold on past-only data by the harness.

- B0 global base rate (floor): venue-neutral — p_D from the training window, the remainder
  split symmetrically (documented interpretation: "global" ignores home advantage, which B1
  then adds; otherwise B0 and B1 would coincide for home-relative outcomes).
- B1 home/away base rate: empirical P(H/D/A) of the training window.
- B2 season-aware expanding base rate: P(H/D/A) using only matches strictly before each
  match's kickoff (point-in-time honest), Laplace-smoothed.
- B3 Elo→1X2: ordered logistic (A < D < H) on `elo_diff`; the two cutpoints absorb home field.
- B4 independent Poisson: attack/defense strengths + home advantage, outcome probs from the
  score grid (0..10).
- B5 Dixon-Coles: B4 + low-score dependence correction tau(rho) + exponential time decay
  ξ = 0.0065/day (frozen), MLE with warm starts.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

import numpy as np
from scipy.optimize import minimize

from models.walkforward import Sample

Probs = tuple[float, float, float]


class BaselineModel(Protocol):
    name: str

    def fit(self, train: Sequence[Sample]) -> None: ...

    def predict(self, s: Sample) -> Probs: ...


MAX_GOALS = 10
DC_XI_PER_DAY = 0.0065  # frozen time-decay
_SMOOTH = 1.0  # Laplace smoothing for count-based rates


def _rates(counts: dict[str, int]) -> Probs:
    n = sum(counts.values()) + 3 * _SMOOTH
    return (
        (counts.get("H", 0) + _SMOOTH) / n,
        (counts.get("D", 0) + _SMOOTH) / n,
        (counts.get("A", 0) + _SMOOTH) / n,
    )


@dataclass
class B0GlobalFloor:
    name: str = "B0"
    p: Probs = (1 / 3, 1 / 3, 1 / 3)

    def fit(self, train: Sequence[Sample]) -> None:
        draws = sum(1 for s in train if s.outcome == "D")
        p_d = (draws + _SMOOTH) / (len(train) + 3 * _SMOOTH)
        rest = (1.0 - p_d) / 2.0
        self.p = (rest, p_d, rest)

    def predict(self, s: Sample) -> Probs:
        return self.p


@dataclass
class B1HomeAway:
    name: str = "B1"
    p: Probs = (1 / 3, 1 / 3, 1 / 3)

    def fit(self, train: Sequence[Sample]) -> None:
        counts: dict[str, int] = {}
        for s in train:
            counts[s.outcome] = counts.get(s.outcome, 0) + 1
        self.p = _rates(counts)

    def predict(self, s: Sample) -> Probs:
        return self.p


@dataclass
class B2Expanding:
    """Expanding point-in-time rates over the full ordered dev history (built once)."""

    all_samples: Sequence[Sample]
    name: str = "B2"
    _by_match: dict[int, Probs] = field(default_factory=dict)

    def __post_init__(self) -> None:
        counts: dict[str, int] = {}
        for s in sorted(self.all_samples, key=lambda x: (x.kickoff_utc, x.match_id)):
            self._by_match[s.match_id] = _rates(counts)
            counts[s.outcome] = counts.get(s.outcome, 0) + 1

    def fit(self, train: Sequence[Sample]) -> None:  # state is inherently past-only
        return

    def predict(self, s: Sample) -> Probs:
        return self._by_match[s.match_id]


@dataclass
class B3EloOrdinal:
    """Ordered logit: P(A) = sigma(c1 - b*x), P(A or D) = sigma(c2 - b*x), x = elo_diff."""

    name: str = "B3"
    beta: float = 0.0
    c1: float = -1.0
    c2: float = 0.0

    def fit(self, train: Sequence[Sample]) -> None:
        x = np.array([s.features["elo_diff"] for s in train]) / 100.0  # scale for stability
        y = np.array([{"A": 0, "D": 1, "H": 2}[s.outcome] for s in train])

        def nll(theta: np.ndarray) -> float:
            beta, c1, gap = theta
            c2 = c1 + np.exp(gap)  # enforce c1 < c2
            z1 = 1.0 / (1.0 + np.exp(-(c1 - beta * x)))
            z2 = 1.0 / (1.0 + np.exp(-(c2 - beta * x)))
            p = np.where(y == 0, z1, np.where(y == 1, z2 - z1, 1.0 - z2))
            return float(-np.log(np.clip(p, 1e-12, None)).sum())

        res = minimize(nll, x0=np.array([self.beta, self.c1, 0.0]), method="Nelder-Mead")
        self.beta, self.c1 = float(res.x[0]), float(res.x[1])
        self.c2 = self.c1 + float(np.exp(res.x[2]))

    def predict(self, s: Sample) -> Probs:
        x = s.features["elo_diff"] / 100.0
        z1 = 1.0 / (1.0 + math.exp(-(self.c1 - self.beta * x)))
        z2 = 1.0 / (1.0 + math.exp(-(self.c2 - self.beta * x)))
        return (1.0 - z2, z2 - z1, z1)


def _dc_tau(
    hg: np.ndarray, ag: np.ndarray, lh: np.ndarray, la: np.ndarray, rho: float
) -> np.ndarray:
    """Dixon-Coles low-score correction factor per match."""
    tau = np.ones_like(lh)
    m00 = (hg == 0) & (ag == 0)
    m01 = (hg == 0) & (ag == 1)
    m10 = (hg == 1) & (ag == 0)
    m11 = (hg == 1) & (ag == 1)
    tau[m00] = 1.0 - lh[m00] * la[m00] * rho
    tau[m01] = 1.0 + lh[m01] * rho
    tau[m10] = 1.0 + la[m10] * rho
    tau[m11] = 1.0 - rho
    result: np.ndarray = np.clip(tau, 1e-10, None)
    return result


@dataclass
class B4Poisson:
    """Independent Poisson goals; MLE over (mu, home_adv, attack_i, defence_i)."""

    name: str = "B4"
    use_dc: bool = False  # B5 subclasses via flag: adds rho + time decay
    teams: dict[int, int] = field(default_factory=dict)
    params: np.ndarray | None = None
    rho: float = 0.0

    def _lambdas(
        self, params: np.ndarray, hi: np.ndarray, ai: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        t = len(self.teams)
        mu, home = params[0], params[1]
        att = np.append(params[2 : 2 + t - 1], -params[2 : 2 + t - 1].sum())
        dfn = np.append(params[1 + t : 1 + t + t - 1], -params[1 + t : 1 + t + t - 1].sum())
        lh = np.exp(np.clip(mu + home + att[hi] - dfn[ai], -10.0, 5.0))
        la = np.exp(np.clip(mu + att[ai] - dfn[hi], -10.0, 5.0))
        return lh, la

    def fit(self, train: Sequence[Sample]) -> None:
        self.teams = {
            tid: i
            for i, tid in enumerate(
                sorted({t for s in train for t in (s.home_team_id, s.away_team_id)})
            )
        }
        t = len(self.teams)
        hi = np.array([self.teams[s.home_team_id] for s in train])
        ai = np.array([self.teams[s.away_team_id] for s in train])
        hg = np.array([s.home_goals for s in train], dtype=float)
        ag = np.array([s.away_goals for s in train], dtype=float)
        now: datetime = max(s.kickoff_utc for s in train)
        if self.use_dc:
            days = np.array([(now - s.kickoff_utc).days for s in train], dtype=float)
            w = np.exp(-DC_XI_PER_DAY * days)
        else:
            w = np.ones(len(train))

        n_params = 2 + 2 * (t - 1) + (1 if self.use_dc else 0)
        x0 = np.zeros(n_params)
        x0[0] = math.log(max(float((hg.sum() + ag.sum()) / (2 * len(train))), 0.1))
        if self.params is not None and len(self.params) == n_params:
            x0 = self.params  # warm start across folds

        def nll(theta: np.ndarray) -> float:
            core = theta[:-1] if self.use_dc else theta
            lh, la = self._lambdas(core, hi, ai)
            ll = w * (hg * np.log(lh) - lh + ag * np.log(la) - la)
            if self.use_dc:
                ll = ll + w * np.log(_dc_tau(hg, ag, lh, la, float(theta[-1])))
            return float(-ll.sum())

        bounds = [(None, None)] * (n_params - 1) + [(-0.9, 0.9)] if self.use_dc else None
        res = minimize(nll, x0=x0, method="L-BFGS-B", bounds=bounds)
        self.params = res.x
        if self.use_dc:
            self.rho = float(res.x[-1])

    def predict(self, s: Sample) -> Probs:
        assert self.params is not None
        core = self.params[:-1] if self.use_dc else self.params
        t = len(self.teams)
        mu, home = core[0], core[1]
        att_free = core[2 : 2 + t - 1]
        dfn_free = core[1 + t : 1 + t + t - 1]
        att = np.append(att_free, -att_free.sum())
        dfn = np.append(dfn_free, -dfn_free.sum())

        def strength(team_id: int) -> tuple[float, float]:
            idx = self.teams.get(team_id)
            if idx is None:  # unseen team: league average
                return 0.0, 0.0
            return float(att[idx]), float(dfn[idx])

        a_h, d_h = strength(s.home_team_id)
        a_a, d_a = strength(s.away_team_id)
        lh = math.exp(mu + home + a_h - d_a)
        la = math.exp(mu + a_a - d_h)

        g = np.arange(MAX_GOALS + 1)
        ph = np.exp(-lh) * lh**g / np.array([math.factorial(int(k)) for k in g])
        pa = np.exp(-la) * la**g / np.array([math.factorial(int(k)) for k in g])
        grid = np.outer(ph, pa)
        if self.use_dc and abs(self.rho) > 1e-12:
            for i, j in ((0, 0), (0, 1), (1, 0), (1, 1)):
                hg_ = np.array([float(i)])
                ag_ = np.array([float(j)])
                grid[i, j] *= float(_dc_tau(hg_, ag_, np.array([lh]), np.array([la]), self.rho)[0])
        grid /= grid.sum()
        p_home = float(np.tril(grid, -1).sum())
        p_draw = float(np.trace(grid))
        p_away = float(np.triu(grid, 1).sum())
        return (p_home, p_draw, p_away)


def b5_dixon_coles() -> B4Poisson:
    return B4Poisson(name="B5", use_dc=True)
