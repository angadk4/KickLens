"""T-081: metric definitions, exactly per Protocol §8.

Outcomes ordered H > D > A (index 0/1/2); probabilities clipped to [1e-15, 1-1e-15] for
log loss; ECE uses M=10 equal-width bins on the max probability. Accuracy/confusion are
diagnostics only — never selection criteria.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

OUTCOMES = ("H", "D", "A")
CLIP = 1e-15
ECE_BINS = 10

Probs = tuple[float, float, float]


def _index(outcome: str) -> int:
    return OUTCOMES.index(outcome)


def log_loss_match(p: Probs, outcome: str) -> float:
    q = min(max(p[_index(outcome)], CLIP), 1.0 - CLIP)
    return -math.log(q)


def rps_match(p: Probs, outcome: str) -> float:
    y = [0.0, 0.0, 0.0]
    y[_index(outcome)] = 1.0
    cum_p, cum_y, total = 0.0, 0.0, 0.0
    for k in range(2):  # k = 1..K-1 cumulative sums
        cum_p += p[k]
        cum_y += y[k]
        total += (cum_p - cum_y) ** 2
    return total / 2.0


def brier_match(p: Probs, outcome: str) -> float:
    y = [0.0, 0.0, 0.0]
    y[_index(outcome)] = 1.0
    return sum((p[c] - y[c]) ** 2 for c in range(3))


def pooled(per_match: Sequence[float]) -> float:
    return sum(per_match) / len(per_match) if per_match else float("nan")


def ece(probs: Sequence[Probs], outcomes: Sequence[str]) -> float:
    """Expected calibration error on the max-prob class, M=10 equal-width bins."""
    n = len(probs)
    if n == 0:
        return float("nan")
    bins: list[list[tuple[float, bool]]] = [[] for _ in range(ECE_BINS)]
    for p, o in zip(probs, outcomes, strict=True):
        conf = max(p)
        pred = p.index(conf)
        b = min(int(conf * ECE_BINS), ECE_BINS - 1)
        bins[b].append((conf, pred == _index(o)))
    total = 0.0
    for bucket in bins:
        if not bucket:
            continue
        acc = sum(hit for _, hit in bucket) / len(bucket)
        conf = sum(c for c, _ in bucket) / len(bucket)
        total += (len(bucket) / n) * abs(acc - conf)
    return total


def classwise_ece(probs: Sequence[Probs], outcomes: Sequence[str]) -> dict[str, float]:
    """Per-outcome reliability: ECE of the class-c probability vs the class-c indicator."""
    n = len(probs)
    out: dict[str, float] = {}
    for c, name in enumerate(OUTCOMES):
        bins: list[list[tuple[float, bool]]] = [[] for _ in range(ECE_BINS)]
        for p, o in zip(probs, outcomes, strict=True):
            b = min(int(p[c] * ECE_BINS), ECE_BINS - 1)
            bins[b].append((p[c], _index(o) == c))
        total = 0.0
        for bucket in bins:
            if not bucket:
                continue
            freq = sum(hit for _, hit in bucket) / len(bucket)
            conf = sum(q for q, _ in bucket) / len(bucket)
            total += (len(bucket) / n) * abs(freq - conf)
        out[name] = total
    return out


def accuracy(probs: Sequence[Probs], outcomes: Sequence[str]) -> float:
    if not probs:
        return float("nan")
    hits = sum(p.index(max(p)) == _index(o) for p, o in zip(probs, outcomes, strict=True))
    return hits / len(probs)


def confusion(probs: Sequence[Probs], outcomes: Sequence[str]) -> list[list[int]]:
    """3x3 [actual][predicted] counts, H/D/A order."""
    m = [[0, 0, 0] for _ in range(3)]
    for p, o in zip(probs, outcomes, strict=True):
        m[_index(o)][p.index(max(p))] += 1
    return m


def summarize(probs: Sequence[Probs], outcomes: Sequence[str]) -> dict[str, float]:
    lls = [log_loss_match(p, o) for p, o in zip(probs, outcomes, strict=True)]
    return {
        "n": float(len(probs)),
        "log_loss": pooled(lls),
        "rps": pooled([rps_match(p, o) for p, o in zip(probs, outcomes, strict=True)]),
        "brier": pooled([brier_match(p, o) for p, o in zip(probs, outcomes, strict=True)]),
        "ece": ece(probs, outcomes),
        "accuracy": accuracy(probs, outcomes),
    }
