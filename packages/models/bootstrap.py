"""T-082: matchweek block-bootstrap uncertainty (Protocol §9).

Resampling unit = matchweek block (never per match); 2,000 resamples; 95% percentile CI;
seeded and deterministic. Paired comparisons resample the same blocks for both models.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np

N_RESAMPLES = 2000
CI_LEVEL = 95.0
PRACTICAL_THRESHOLD_NATS = 0.005


@dataclass(frozen=True)
class BootstrapResult:
    mean: float
    ci_low: float
    ci_high: float
    n_blocks: int

    @property
    def ci_excludes_zero(self) -> bool:
        return self.ci_low > 0.0 or self.ci_high < 0.0


def _block_arrays(per_block: Mapping[tuple[int, int], Sequence[float]]) -> list[np.ndarray]:
    return [np.asarray(v, dtype=float) for _, v in sorted(per_block.items())]


def block_bootstrap_mean(
    per_block: Mapping[tuple[int, int], Sequence[float]],
    *,
    seed: int = 42,
    n_resamples: int = N_RESAMPLES,
) -> BootstrapResult:
    """Bootstrap the pooled per-match mean by resampling whole matchweek blocks."""
    blocks = _block_arrays(per_block)
    n = len(blocks)
    rng = np.random.default_rng(seed)
    stats = np.empty(n_resamples)
    for i in range(n_resamples):
        idx = rng.integers(0, n, size=n)
        sample = np.concatenate([blocks[j] for j in idx])
        stats[i] = float(sample.mean())
    lo, hi = np.percentile(stats, [(100 - CI_LEVEL) / 2, 100 - (100 - CI_LEVEL) / 2])
    pooled = float(np.concatenate(blocks).mean())
    return BootstrapResult(mean=pooled, ci_low=float(lo), ci_high=float(hi), n_blocks=n)


def paired_diff(
    losses_a: Mapping[tuple[int, int], Sequence[float]],
    losses_b: Mapping[tuple[int, int], Sequence[float]],
    *,
    seed: int = 42,
    n_resamples: int = N_RESAMPLES,
) -> BootstrapResult:
    """Bootstrap of per-match loss differences (A - B) on identical matches/blocks.
    Negative mean ⇒ A better (lower loss) than B."""
    if sorted(losses_a) != sorted(losses_b):
        raise ValueError("paired comparison requires identical block keys")
    diffs = {k: [x - y for x, y in zip(losses_a[k], losses_b[k], strict=True)] for k in losses_a}
    return block_bootstrap_mean(diffs, seed=seed, n_resamples=n_resamples)


def is_practical_improvement(diff_a_minus_b: BootstrapResult) -> bool:
    """Protocol §9: mean reduction ≥ 0.005 nats AND the 95% CI excludes 0."""
    return diff_a_minus_b.mean <= -PRACTICAL_THRESHOLD_NATS and diff_a_minus_b.ci_excludes_zero
