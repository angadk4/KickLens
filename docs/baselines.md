# Baseline ladder — dev walk-forward evaluation (M3)

**Date:** 2026-07-06 · Harness: expanding walk-forward, 1-matchweek blocks (ISO-week), dev
2017–2024 with 2017 burn-in → **210 evaluated blocks, 3,012 matches (2018-W9 … 2024-W42)**;
every baseline refit per fold on past-only data; CIs = 2,000-resample matchweek-block bootstrap
(seed 42). Run records: `experiments/runs.jsonl` (dataset `ds-mls-20260706-9d8cbcc3`).
Implementations: `packages/models/baselines.py`; definitions per Master Spec §16 / Contract §6.2.

## Results (dev; log loss = primary)

| Rung | Log loss [95% CI] | RPS | Brier | ECE | Acc | Paired diff vs prev [95% CI] | Verdict |
|---|---|---|---|---|---|---|---|
| B0 global floor | 1.0825 [1.0747, 1.0904] | 0.2345 | 0.6564 | 0.107 | 0.488 | — | — |
| B1 home/away | 1.0499 [1.0363, 1.0641] | 0.2224 | 0.6322 | 0.033 | 0.488 | −0.0326 [−0.0441, −0.0216] | **PRACTICAL** |
| B2 expanding | 1.0498 [1.0362, 1.0640] | 0.2223 | 0.6322 | 0.032 | 0.488 | −0.0001 [−0.0002, +0.0000] | not practical |
| **B3 Elo→1X2** | **1.0345 [1.0182, 1.0507]** | 0.2168 | 0.6213 | 0.030 | 0.493 | −0.0153 [−0.0221, −0.0087] | **PRACTICAL** |
| B4 Poisson | 1.2299 [1.1663, 1.3011] | 0.2261 | 0.6409 | 0.054 | 0.482 | +0.1954 (worse) | not practical |
| B5 Dixon-Coles | 1.0627 [1.0396, 1.0866] | 0.2208 | 0.6309 | 0.034 | 0.487 | −0.1672 vs B4 | PRACTICAL vs B4 |

## Reading (honest)

- **B3 (Elo ordered-logit) is the strongest baseline** and the reference the M4 logistic
  champion must beat by ≥0.005 nats with a CI excluding 0. The ladder behaves exactly as the
  soccer-forecasting literature predicts (home advantage ≈ −0.03 nats; Elo ≈ −0.015 more).
- **B2 ≈ B1** (expanding vs fold-window rates): expected — both are past-only base rates.
- **B4 (independent Poisson, unweighted MLE over the full expanding history) is poor** on log
  loss: overconfident score-grid tails + stale team strengths. Reported as-is — it is a ladder
  rung, not a candidate. **B5's** time decay (ξ=0.0065/day) + low-score correction repairs most
  of it (−0.167) yet still trails B3.
- ECE ≈ 0.03 for the count-based/Elo rungs — reasonably calibrated before any temperature fit.
- Elo here includes **ADR-001** (draws move ratings, G=1 at gd=0).

## Interpretations documented

B0 = venue-neutral floor (p_D empirical, remainder split symmetrically) so that B1's gain
isolates home advantage; matchweek = (ISO year, ISO week) of UTC kickoff; Laplace smoothing
(+1) on count rates.
