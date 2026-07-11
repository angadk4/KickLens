# ADR-003 — Modeling & market-display decisions (frozen)

**Date:** 2026-07-11 · **Status: Accepted** — frozen in Build Contract v2.1 §6 and the ML
Protocol; recorded here per T-251. Evidence: `docs/selection.md`, `docs/baselines.md`.

## Multinomial logistic regression as the champion class
Frozen as the production model class before selection. On dev evidence it proved **statistically
equivalent to the Elo baseline** (paired diff +0.0001 nats, CI [−0.003, +0.003]) and the
smallest feature set (F1 = elo_diff + neutral_site) was best — form/rest/context added no signal
(pre-registered F0–F4 ablation), and a LightGBM challenger was decisively worse (+0.039 nats).
Among equivalents we keep the logistic for calibratable simplicity and interpretable
coefficients. **No superiority claim over Elo is ever made** — the model card leads with this.

## Temperature scaling as the only calibration
One parameter, always fitted (the learned T≈1.16 is itself a diagnostic), per fold/training on
the trailing-20% slice, fallback to raw probabilities if the slice misses the floor or the fit
is degenerate. Isotonic/Dirichlet were removed from the MVP. On dev it left log loss unchanged
while improving ECE ~3× (0.032 → 0.011), so it was adopted per RQ5.

## Market comparison: aggregate/derived display only
No provider licenses raw-odds redistribution. We display only **de-vigged consensus
probabilities and performance metrics**, never raw or per-bookmaker prices (SGO ToS: transformed
/ aggregated outputs are explicitly permitted). The market is framed as a **stronger-information
reference** (closing odds see kickoff-time info the T-3h model cannot) — on dev it beat the model
by ~0.02 nats, reported with CIs, never as a "we beat the market" claim.

## Draws move Elo ratings
See **ADR-001** — the frozen MOV formula's literal `ln(1)=0` would discard draw information;
draws use G=1 (developer-approved 2026-07-06).
