# 2025 touch-once test — OFFICIAL REPORT (one pass, immutable)

> Filled exactly once from `experiments/final_test_2025.json`. Protocol v1.0 is now **frozen**
> (Protocol §13). This test can never be re-run; the 2025 season is spent.

## ⚠ CORRECTION — 2026-08-02

**This report originally under-disclosed the market reference, and drew a false conclusion from
the omission. Nothing was re-run and no number changed: every figure below was already present
in `experiments/final_test_2025.json` from the single sanctioned 2026-07-12 execution.**

**What was wrong.** The Market row in the results table printed only log loss, dashing RPS,
Brier, ECE and Accuracy — the four columns in which the market *beats* the champion. The
Interpretation then claimed the champion's ECE was "best of all eight evaluated models." It was
not: the de-vigged closing market was calibrated roughly twice as well (ECE **0.0128** vs
**0.0272**).

**Why that mattered.** Protocol §187 and `run_final_test.py` both pre-register that this report
carries *every* pre-registered metric for *every* pre-registered model, "not only the champion's
best figure." Selective omission is exactly what that clause forbids, and the resulting sentence
was the only superiority claim anywhere in the project — against a market the Master Spec (§21)
says is explicitly never claimed to be beaten.

**The corrected claim, verified against the sealed JSON:** the champion's ECE of 0.0272 is the
best of the **seven pre-registered models** (next best: B3 Elo at 0.0358). The market reference,
which sees three more hours of information than the T-3h cutoff, was better calibrated still.

The table and Interpretation below are corrected in place and marked **†**. Marked-up copies of
the original wording are retained in git history and in `BUILD_LOG.md` (2026-08-02). Found by
the 2026-08-02 multi-lens site audit; two independent lenses converged on it.

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
| Market (de-vigged Pinnacle closing; n=510/510) † | 510 | **1.0317** | **0.2161** | **0.6195** | **0.0128** | 0.492 |

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
advantage over the pre-registered field (champion ECE 0.0272 — best of the **seven
pre-registered models** on unseen data; next best B3 Elo at 0.0358). † The de-vigged closing
market was better calibrated still (0.0128), as it is better on RPS, Brier and accuracy — it
sees three hours of information the T-3h cutoff cannot. The market is a reference, not a
competitor in the pre-registered field, and no claim to beat it is made here or anywhere else.

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
