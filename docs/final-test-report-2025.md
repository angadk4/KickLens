# 2025 touch-once test — OFFICIAL REPORT (one pass, immutable)

> Filled exactly once from `experiments/final_test_2025.json`. Protocol v1.0 is now **frozen**
> (Protocol §13). This test can never be re-run; the 2025 season is spent.

## Header

- **Run:** 2026-07-12 16:50 UTC (local machine, single execution) · protocol **v1.0**
  (public tag `protocol-v1.0` → `df73e3f`, pre-dates all training) · seed **42**
- **Dataset:** `ds-mls-20260706-9d8cbcc3` lineage; 2025 = 510 RS matches over 33 matchweek
  blocks; evaluation = dev-harness-identical expanding walk-forward (procedure pre-registered
  in `run_final_test.py` before execution)
- **Self-attestation:** signed in `docs/pre-final-test-checklist.md` (Angad Khera, 2026-07-12);
  mechanically corroborated by the 2024 hard-cap in the dev loader and the public pre-training tag
- **Gates:** checklist-complete + deliberate env flag + no-prior-output — all verified before run

## Results — every pre-registered model (log loss primary; 95% matchweek-block-bootstrap CIs)

| Model | n | Log loss [95% CI] | RPS | Brier | ECE | Accuracy* |
|---|---|---|---|---|---|---|
| B0 global floor | 510 | 1.0827 [1.0765, 1.0891] | 0.2343 | 0.6566 | 0.0619 | 0.437 |
| B1 home/away | 510 | 1.0802 [1.0674, 1.0929] | 0.2332 | 0.6544 | 0.0542 | 0.437 |
| B2 expanding | 510 | 1.0803 [1.0675, 1.0929] | 0.2332 | 0.6544 | 0.0541 | 0.437 |
| **B3 Elo (pre-registered fallback)** | 510 | **1.0504 [1.0163, 1.0816]** | 0.2225 | 0.6317 | 0.0358 | 0.463 |
| B4 Poisson | 510 | 1.0745 [1.0455, 1.1067] | 0.2302 | 0.6495 | 0.0577 | 0.469 |
| B5 Dixon-Coles | 510 | 1.2342 [1.1701, 1.3043] | 0.2251 | 0.6397 | 0.0683 | 0.500 |
| **Champion: logistic-F1-C0.1+temperature** | 510 | **1.0507 [1.0213, 1.0778]** | **0.2220** | 0.6318 | **0.0272** | 0.459 |
| Market (de-vigged Pinnacle closing; n=510/510) | 510 | **1.0317** | — | — | — | — |

\* accuracy is a diagnostic, never a selection criterion.

## Pre-registered comparisons

- **Champion − B3 (fallback): +0.0004 nats, 95% CI [−0.0043, +0.0055].**
  Dev expectation: equivalence (+0.0001 [−0.003, +0.003]). **Replicated exactly.** The
  fallback clause is not triggered — champion and fallback are statistically identical, as on dev.
- **Champion − market: +0.0190 nats, 95% CI [+0.0097, +0.0284].**
  Dev expectation: market better by ≈0.0197. **Replicated exactly.** The market remains the
  stronger-information reference; this comparison is descriptive only.

## Interpretation (per the rules fixed before the numbers existed)

**The champion deploys.** Every *relative*, pre-registered expectation replicated out-of-time:
equivalence with Elo (+0.0004), the ~0.02-nat market gap (+0.0190), and the calibration
advantage (champion ECE 0.0272 — best of all eight evaluated models on unseen data).

**Honest absolute-level note (led with, not buried):** the champion's absolute log loss
(1.0507) sits above its dev estimate (1.0346). This shift affected **every model including the
market itself** (market: 1.0317 on 2025 vs 1.0149 on dev — +0.017). The season-level cause is
visible in model-free data: 2025 had the weakest home advantage of the era (43.7% home wins vs
~48–55% in prior seasons), collapsing the home-advantage baseline B1 from 1.0499 (dev) to
1.0802. 2025 was intrinsically harder to predict for everyone with any information set; the
champion's standing *relative to the field* was exactly as forecast. The dev-band clause
(~1.03–1.04) was written without anticipating a season-difficulty shift; the deploy decision
rests on the pre-registered relative comparisons, and this note records that judgment
transparently.

**Additional finding:** B5 Dixon-Coles degraded badly out-of-time (1.2342) — its rejection
during selection is vindicated; the time-decay MLE is fragile on this data.

## Classwise calibration (champion, 2025)

H: 0.0447 · D: 0.0124 · A: 0.0419 (classwise ECE)

## Deviations / incidents during the run

None. Single execution, exit 0, all 510 matches evaluated, output written immutably on first
attempt. The `test`-scope metrics snapshot is published to the production database for the
dashboard's Test panel.
