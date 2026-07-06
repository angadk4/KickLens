# 2025 touch-once test — report template (§14 integrity item)

> Filled in EXACTLY ONCE from `experiments/final_test_2025.json` after the one-shot run.
> Every metric for every model is reported — nothing may be omitted, whatever the numbers say.
> Viewing the results freezes protocol v1.0 (Protocol §13).

## Header

- Run date (UTC): ____ · protocol: v1.0 (tag `protocol-v1.0` → `df73e3f`) · seed: 42
- Dataset snapshot: ____ · code commit: ____ · lockfile hash: ____
- 2025 evaluated matches: ____ across ____ matchweek blocks
- Developer self-attestation of no test-set peeking: signed ____ (date)

## Results — all pre-registered models (log loss primary; 95% block-bootstrap CIs)

| Model | n | Log loss [95% CI] | RPS | Brier | ECE | Accuracy* |
|---|---|---|---|---|---|---|
| B0 global floor | | | | | | |
| B1 home/away | | | | | | |
| B2 expanding | | | | | | |
| B3 Elo (pre-registered fallback) | | | | | | |
| B4 Poisson | | | | | | |
| B5 Dixon-Coles | | | | | | |
| **Champion: logistic-F1-C0.1+temperature** | | | | | | |
| Market (de-vigged closing; intersection n=____) | | | | | | |

\* accuracy is a diagnostic, never a selection criterion.

## Pre-registered comparisons

- Champion − B3 (fallback): mean ____ nats, 95% CI [____, ____].
  Dev expectation: equivalence (+0.0001 [−0.003, +0.003]).
- Champion − market: mean ____ nats, 95% CI [____, ____].
  Dev expectation: market better by ≈0.02 nats (stronger-information reference; descriptive only).

## Interpretation rules (fixed before the numbers existed)

1. If the champion is within the practical band of its dev log loss (~1.03–1.04): report as
   consistent; deploy the champion as the production model class.
2. If the champion fails badly but B3 holds: invoke the pre-registered fallback (B3) and say so
   publicly — the model card leads with this.
3. Under NO outcome is any model retrained/re-tuned against 2025. The season is spent either way.
4. The result is reported with its CI and sample size wherever "test" evidence appears, clearly
   separated from dev/backtest/live.

## Classwise calibration (champion)

H: ____ · D: ____ · A: ____ (classwise ECE)

## Deviations / incidents during the run

(none expected; anything at all gets written here verbatim)
