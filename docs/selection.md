# M4 — model + calibration selection evidence (dev walk-forward, 2018–2024)

**Date:** 2026-07-06 · All numbers: 210 matchweek folds / 3,012 evaluated matches, seed 42,
2,000-resample block-bootstrap CIs. Full trail in `experiments/runs.jsonl`.
**STATUS: SELECTION SEALED — developer approved the freeze 2026-07-06.** The frozen recipe
lives in `packages/models/champion.py` (logistic F1 C=0.1 + temperature; pre-registered
fallback B3). No further tuning is possible; the 2025 touch-once test (T-260) runs only after
the full Protocol §14 checklist (see `docs/pre-final-test-checklist.md`).

## T-090 — Logistic F0–F4 × C ablation (RQ7, pre-registered)

| F-set (best C) | Log loss | Gap vs best [95% CI] | Within 0.005? |
|---|---|---|---|
| F0 (C=0.01) | 1.0502 | +0.0153 [+0.0086, +0.0224] | no |
| **F1 (C=0.1)** | **1.0349** | ±0 (is best) | **yes — selected** |
| F2 (C=0.01) | 1.0367 | +0.0018 [−0.0017, +0.0054] | yes |
| F3 (C=0.01) | 1.0381 | +0.0032 [−0.0005, +0.0069] | yes |
| F4 (C=0.01) | 1.0396 | +0.0047 [+0.0007, +0.0089] | yes |

**Selected: F1 = {elo_diff, neutral_site} + intercepts, C=0.1** — the smallest set within the
practical threshold of the best, and in fact the best outright. The form/rest/context blocks add
no signal beyond Elo on dev (consistent with the Contract's "Elo covers opponent-adjusted form").
Regularization matters little (C-rows nearly flat).

## T-101 — Calibration (RQ5): temperature ADOPTED

| Variant | Log loss | ECE |
|---|---|---|
| Raw logistic F1 | 1.0349 | 0.0320 |
| + per-fold temperature | 1.0346 | **0.0108** |

Paired diff −0.00030 [−0.00273, +0.00224] (not worse), ECE improves ~3×. Mean fitted T = 1.157
(mild overconfidence corrected); fitted on 176/210 folds, 34 early folds below the ≥150/≥30
floor fell back to raw exactly as designed.

## T-092 — Promotion gate vs incumbent B3 (Elo ordinal): NOT CLEARED

Champion candidate (logistic F1 + temperature): 1.0346 / ECE 0.0108.
Incumbent B3: 1.0345 / ECE 0.0295. Paired diff **+0.00012 [−0.00296, +0.00304]**.

**Honest verdict: the logistic champion is statistically EQUIVALENT to B3 on log loss** — both
are monotone functions of `elo_diff`. The gate (≥0.005 nats better AND CI excludes 0) is not
cleared, and **no "beats the baseline" claim may ever be made.** Rationale for the candidate
champion remaining the logistic (pending developer sign-off at the freeze): (a) the Contract
froze the champion *class* as multinomial logistic (§6.3); (b) among equivalents the tie-break
favors calibratable simplicity — with temperature it is 3× better calibrated (ECE 0.011 vs
0.030); (c) it exposes coefficients for the model card. Runner-up recorded: B3.

## T-110 — Market reference (RQ6, descriptive only)

De-vigged (proportional) Pinnacle closing on the identical 3,012 matches: **log loss 1.0149,
ECE 0.0196**. Champion gap: **+0.0197 [+0.0126, +0.0270] nats behind the market** — as expected:
closing odds see everything to kickoff, the model freezes at T-3h. This is the
stronger-information reference ceiling, reported with CIs, never a target claim.
No selection bias in the subset: coverage is 3,012/3,012 (T-004's one gap predates 2018 blocks).

## T-091 — LightGBM challenger (E4): DOES NOT SHIP

12 configs (leaves ∈ {7,15,31} × lr ∈ {0.02,0.05,0.1,0.2}, 300 trees, deterministic seed) on
F4 over the same 210 folds. Best: leaves=7, lr=0.02 → **log loss 1.0743**, paired diff vs the
champion **+0.0394 [+0.0282, +0.0523]** — decisively worse, degrading monotonically with
capacity (1.07 → 2.49 across the grid): the classic small-tabular-data overfit signature, and
consistent with RQ7's finding that there is no signal beyond `elo_diff` for trees to exploit.
**Gate verdict: does not ship (the pre-registered default).** The E4 experiment is closed with
evidence; per the Contract the challenger re-runs only as a monthly-retrain experiment.

## Provenance

dataset `ds-mls-20260706-9d8cbcc3` · fs-v1 (ADR-001 Elo) · commit b71efa62+ · lockfile eeee03a3 ·
runs.jsonl kinds: `logistic-ablation-dev` ×20, `logistic-ablation-selection`,
`selection-report`, `lgbm-challenger-*`.
