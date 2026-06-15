# SoccerEdge ML Experimental Protocol Version 1.0

**Derived from:** SoccerEdge Build Contract v2.1 (frozen decisions).
**Purpose:** pre-register every methodological choice **before results are observed**, so model selection cannot drift toward the final-test set. This document optimizes for **trustworthy evidence**, not impressive numbers.
**Prime directive:** all model-selection decisions are made on the **development walk-forward (2018–2024 predictions)**. The **2025 season is untouched** until a single, one-shot, confirmatory final test. **The final test changes no decision** — it reports the out-of-time performance of an already-selected pipeline plus pre-registered baselines.
**Status:** pre-registered. Any change after dev results are viewed requires a version bump (§13); any change after the final test is viewed **burns** the 2025 test and requires a new reserved season.
**Date frozen:** ________ (fill at git-tag time) · **Protocol version:** 1.0 · **Dataset snapshot:** `ds-mls-2012_2025-<YYYYMMDD>-<sha8>` (pinned at freeze).

---

## 1. Research-question table

Every experiment answers exactly one named question. "Decided on" states which data may inform the decision; the 2025 test is never a selection input.

| RQ | Question | Comparison | Primary metric | Decided on | Decision rule (pre-registered) |
|---|---|---|---|---|---|
| **RQ1** | Does Elo improve on league base rates? | B3 vs best of {B0,B1,B2} | log loss | Dev WF | Promote Elo if it meets the §9 practical gate vs the best base rate |
| **RQ2** | Does a goal model improve on Elo? | B5 (Dixon-Coles) vs B3 | log loss | Dev WF | Promote DC if it meets the gate vs Elo |
| **RQ3** | Does logistic regression improve on the best baseline? | Logistic (selected F-set) vs best of {B3,B5} | log loss | Dev WF | Promote logistic if it meets the gate vs the best baseline |
| **RQ4** | Do gradient-boosted trees improve on logistic? | LightGBM vs logistic | log loss | Dev WF | Promote LightGBM **only** if it meets the gate; **default = ship logistic** |
| **RQ5** | Does calibration improve out-of-time probabilistic performance? | Temperature scaling vs uncalibrated | log loss + ECE (out-of-fold) | Dev WF | Adopt temperature only if it does **not** worsen OOF log loss **and** does not worsen ECE (§7) |
| **RQ6** | Does the selected model approach the market under a fair information cutoff? | Model-at-cutoff vs market | log loss, RPS, ECE | Dev/backtest + Live | **Descriptive only.** Report the gap with CIs. **No "beats the market" claim** absent strong out-of-sample evidence |
| **RQ7** | Which feature blocks carry signal? | Nested F0→F4 for logistic | log loss | Dev WF | Select the **smallest** F-set within the practical threshold of the best (§9 tie-break) |

---

## 2. Dataset contract

| Item | Locked value |
|---|---|
| Included seasons (evaluation) | **Dev: MLS 2017–2024** · **Final test: 2025** (production deploy model also uses 2025; live = 2026+) |
| Excluded seasons | **2012–2016** (relevance/distribution shift) — available only as a post-MVP sensitivity, never in the v1.0 evaluation |
| Match inclusion | MLS **regular-season** matches |
| Match exclusion | MLS Cup playoffs; Leagues Cup; U.S. Open Cup; CONCACAF; friendlies/preseason; All-Star; internationals |
| Data-provider versions | **football-data.co.uk `new/USA.csv`** (snapshot pinned in the dataset id) for ≤2025; **API-Football (free)** for current-season rows (Highlightly backup) |
| Dataset snapshot id | `ds-mls-2012_2025-<YYYYMMDD>-<sha8>` — SHA-256 over the concatenated raw files; recorded once, immutable |
| Duplicate-removal | Dedupe on `(season, date, home_team_id, away_team_id)`; keep the first; log removals |
| Missing-data | Form inputs → shrink to league mean (PPG≈1.35, GD=0); Elo (new team) → 1500; missing result → row stays `pending`; missing odds → row excluded from the market-comparison **subset only** |
| Fixture-revision | Historical rows have **no provider id** (natural key); live rows carry `fixture_revision` |
| Team-identity | Internal surrogate `team_id` + curated `team_alias`; explicit handling of renamed/relocated/defunct clubs (e.g., Chivas USA) |
| COVID-period (2020) | **Included** in the primary analysis (Elo/form adapt); a pre-registered **sensitivity** excludes 2020; a `season=2020` indicator is available but **not** added as a model feature in v1.0 |
| Expansion-team | **Included**; cold-start handling (Elo 1500 + `cold_start` flag for first 10 RS matches) |
| Odds-match intersection | Market comparison runs **only** on matches present in the results set **with non-null Pinnacle closing odds** (`PSCH/PSCD/PSCA`); the model is evaluated on the **full** set, the market comparison on the **intersection**; the subset size and the resulting **selection-bias caveat** are reported |

---

## 3. Temporal split table

| Phase | Period | Role | Decision-eligible? |
|---|---|---|---|
| Elo warm-up / first training | **2017** (full season) | Warm Elo and provide the first training window; **never predicted** | n/a |
| Walk-forward development | **2018–2024** predictions | Model/feature/hyperparameter/calibration **selection** | **Yes** |
| Calibration slice | Trailing **20%** of each fold's training window (time-ordered, past-only) | Fit temperature scaling within-fold | Yes (within dev) |
| **Final untouched test** | **2025** | One-shot out-of-time **confirmation + reporting** | **NO — untouched until the single final run** |
| Backtest (simulated production) | 2018–2025 regenerated through the production code path | Public display, **labelled "backtest"** | Display only |
| Live evaluation | **From launch (~2026-07-16)** onward | Genuine live track record | Reporting only |

**Walk-forward design (locked):** expanding window; **block = one matchweek**; for each block, train on all matches with `event_time < block.start`, refit everything (Elo state, scaler, calibration) on past-only data, predict the block, score it. Dev metrics aggregate the 2018–2024 blocks.

**Decision-use rule:** only the **2018–2024 dev walk-forward** may inform any choice. **2025 is sealed.** The backtest display may include 2018–2025, but the **number reported as the OOT estimate is the one-shot 2025 result**, which is never used to tune.

### 3A. Preprocessing & leakage lock
Every operation is fit **only** on the appropriate past-only training window, **refit per fold**:
- **Scaling:** standardization (mean/var) fit on the fold's training matches only; applied to the block.
- **Imputation:** missing values filled using **only** past-window statistics (league means computed pre-block); never global.
- **Encoding:** team identity via the static alias map (no target/frequency encoding from future data).
- **Feature selection:** the F0→F4 ablation is a **pre-registered** selection on dev WF only; **no informal post-hoc feature additions** (new features ⇒ new protocol version).
- **Elo initialization:** new teams start at **1500**; start-of-season regression `R←1500+0.75(R−1500)`; the current match never updates its own pre-match Elo.
- **Calibration:** temperature fit on the trailing-20% **calibration slice** of the fold's training window; evaluated **out-of-fold** on the block.
- **Hyperparameter tuning:** selected on dev WF log loss only; the 2025 test is never a tuning signal.

---

## 4. Feature-set registry

Nested sets; **all are subsets of `fs-v1`** (Build Contract §6.1). `F4 ≡ fs-v1`.

| Set | Features added | Cumulative contents |
|---|---|---|
| **F0** (structural) | intercept (bias), `neutral_site` | intercept, `neutral_site` |
| **F1** (+Elo) | `elo_diff` | F0 + `elo_diff` |
| **F2** (+form) | `form5_pts, form10_pts, form5_gd, form10_gd, home_form5_pts, away_form5_pts` | F1 + form block |
| **F3** (+rest/congestion) | `rest_days_home, rest_days_away, congestion_home, congestion_away` | F2 + rest/congestion |
| **F4** (+context) = **fs-v1** | `season_progress, cold_start_home, cold_start_away` | F3 + context block |

**Locked rule:** logistic is evaluated on F0–F4; the **selected set is frozen before the final test**. Baselines B3/B4/B5 use their own intrinsic inputs (Elo / goals), not these sets. **No feature outside fs-v1 may be introduced without a new protocol version.**

---

## 5. Baseline and model ladder

Mandatory order; a rung is **promoted only after meeting its §10 criterion** versus the current incumbent.

1. **B0** — global 1X2 base rate (expanding, past-only).
2. **B1** — home/away base rate.
3. **B2** — season-aware expanding base rate.
4. **B3** — **Elo → 1X2** (ordinal logistic link on `elo_diff` + home field).
5. **B4** — independent-Poisson goal model → outcome grid.
6. **B5** — **Dixon-Coles** (low-score correction + exponential time-decay ξ=0.0065/day).
7. **M1** — **multinomial logistic regression** (selected F-set; L2; standardized).
8. **M2** — **LightGBM** multiclass (challenger; experiment **E4**).
9. *(Ensembles / Bayesian — excluded from v1.0; require a new protocol version.)*

The market (Pinnacle closing odds; live same-cutoff if **E3** GO) is a **reference ceiling**, not a rung to "beat."

---

## 6. Hyperparameter budget

| Model | Search method | Search space | Max trials | Seed(s) | Optimization metric | Early stopping | Compute | Tie-break |
|---|---|---|---|---|---|---|---|---|
| B0–B3, B5 | none (closed-form / fixed) | — | — | n/a | — | — | trivial | — |
| **M1 logistic** | exhaustive grid | `C ∈ {0.01, 0.1, 1, 10}` × F-sets {F0..F4} | **20** | `42` | dev WF mean log loss | n/a | CPU minutes | prefer **stronger L2 (smaller C)** and **smaller F-set** |
| **M2 LightGBM** | exhaustive grid | `num_leaves∈{15,31}`, `max_depth∈{3,5}`, `learning_rate∈{0.03,0.1}`; `n_estimators` via early stopping | **12** | `42` (+ stability re-runs with seeds `{7,123}` reported, not selected on) | dev WF mean log loss | per-fold val tail, patience **50** | CPU minutes | prefer **fewer leaves / shallower / fewer estimators** |

**Total dev configurations evaluated** ≈ 20 (M1) + 12 (M2) + 6 baselines = **~38 dev evaluations**. This exposure is acknowledged in the multiple-comparison policy (§9). The 2025 test is touched **once** regardless. No adaptive/unbounded search (no Optuna sweeps, no manual "one more try").

---

## 7. Calibration protocol

| Item | Locked value |
|---|---|
| Uncalibrated baseline | Raw model probabilities (the default if calibration is degenerate) |
| Methods tested | **Temperature scaling only** (single scalar T on logits; multiclass softmax). Isotonic / Dirichlet / vector scaling = **post-MVP**, require a new protocol version |
| Fitting period | Trailing **20%** of each dev fold's training window (time-ordered, past-only); **refit per fold** |
| Sample-size requirement | Calibration slice must have **≥ 150 matches and ≥ 30 draw outcomes**; otherwise **fall back to uncalibrated** for that fold |
| Promotion criterion (RQ5) | Adopt temperature **only** if, evaluated **out-of-fold** on the prediction blocks, it **does not worsen** dev WF log loss **and does not worsen** ECE (adopt when at least one improves and neither worsens). Never adopt on in-sample reliability alone |
| Probability-sum validation | Assert `|p_H+p_D+p_A − 1| < 1e-6` and each `p∈(0,1)` for every prediction; fail the run otherwise |
| Out-of-time evaluation | The 2025 final test reports **both** calibrated and uncalibrated metrics for transparency |
| Artifact versioning | `calibration_artifact{method=temperature, T, fold_provenance, fit_slice_id}` bound into `model_version` |

---

## 8. Metric definitions

Outcomes ordered for RPS as **H ≻ D ≻ A** (by goal-margin sign). Probabilities clipped to `[1e-15, 1−1e-15]` for log loss.

- **Primary — Multiclass log loss:** `LL = −(1/N) Σ_i Σ_{c∈{H,D,A}} y_{ic} ln p_{ic}`. Lower is better.
- **RPS (ordered):** `RPS = (1/N) Σ_i (1/2) Σ_{k=1}^{2} ( Σ_{j≤k}(p_{ij} − y_{ij}) )^2`, outcomes ordered (H,D,A). Lower is better.
- **Multiclass Brier:** `BS = (1/N) Σ_i Σ_c (p_{ic} − y_{ic})^2`. Lower is better.
- **ECE (M=10 equal-width bins on max-prob):** `ECE = Σ_{m=1}^{10} (|B_m|/N) · |acc(B_m) − conf(B_m)|`; also report **classwise** reliability (per-outcome). Lower is better. (M=10 fixed; adaptive-bin reported as a robustness check only.)
- **Accuracy (diagnostic):** argmax hit rate. **Confusion matrix (diagnostic):** 3×3. *Diagnostic only — never a selection or promotion criterion.*

**Aggregation:** compute per matchweek-block, report the **pooled per-match** value and the **mean across folds**; uncertainty via §9 block bootstrap.
**Public dashboard:** log loss + reliability diagram + aggregate market comparison (each tagged dev / test / backtest / live, with sample size). **Internal:** RPS, Brier, classwise ECE, accuracy, confusion, per-season breakdowns.

---

## 9. Statistical comparison procedure

- **Paired comparison:** per-match loss differences `d_i = loss_A(i) − loss_B(i)` on the **same** matches (primary metric = log loss).
- **Resampling unit:** **matchweek** (block), to respect within-round and repeated-opponent dependence. Naive per-match resampling is **prohibited**.
- **Bootstrap:** **2,000** matchweek-block resamples; report the mean `d` and the **95%** percentile confidence interval.
- **Practical improvement threshold:** **mean reduction ≥ 0.005 nats AND the 95% CI excludes 0.** Improvements smaller than 0.005 nats are treated as **not meaningful** even if a CI excludes 0.
- **Dependent observations:** handled by block resampling; a **by-season** resample is reported as a robustness check, and a promotion's improvement should be **consistent in sign across seasons** (§10).
- **Multiple-comparison policy:** the **ladder promotions** (RQ1–RQ4) each apply the gate **once** against the current incumbent. Parallel choices (the 20 logistic configs, 12 LightGBM configs, F0–F4) are selected by **point estimate (lowest dev log loss)** and are **not** each subjected to a significance test — the gate is applied only at the ladder step that promotes the *selected* model. This avoids p-hacking across configs. The **2025 test is one-shot**, so no test-set multiplicity arises.
- **Inconclusive results:** if the CI includes 0 or the improvement < 0.005 nats, the **incumbent (simpler) model is retained** and the result is reported as "no significant improvement." Inconclusive is a valid, reportable outcome.

---

## 10. Promotion matrix

A challenger replaces the incumbent at a ladder step only if **all** conditions hold (evaluated on **dev WF only**):

| Condition | Requirement |
|---|---|
| Primary-metric improvement | Mean dev WF log-loss reduction **≥ 0.005 nats** vs the incumbent |
| Statistical confidence | **95% matchweek-block-bootstrap CI** of the paired difference **excludes 0** |
| Calibration | Post-calibration **ECE not worse by > 0.02** (absolute) vs the incumbent |
| Fold stability | Sign of improvement positive in **≥ 70%** of folds **and** consistent in sign on the **by-season** robustness check |
| Relative to baselines | Must **not be worse** than B0–B2 on any primary/secondary metric |
| Complexity penalty / tie-break | If two models are within the practical threshold, **choose the simpler** (baseline ≻ logistic ≻ LightGBM; smaller F-set; stronger regularization) |
| **Disqualifiers** | Invalid probabilities (sum ≠ 1 or out of (0,1)); worse than B0; calibration degradation > 0.02; unstable improvement sign across seasons; reliance on any excluded feature/season |

**Selection summary:** climb the ladder; stop promoting when the gate is not met. The **highest-promoted model is the champion**. **Default outcomes:** if M2 (LightGBM) fails RQ4 → ship M1 (logistic). If M1 fails RQ3 → ship the best baseline (B5 or B3). Calibration adopted per §7 or omitted.

---

## 11. Final-test policy

- **What it is:** a **one-shot, confirmatory** evaluation of the **already-selected** pipeline (champion model + chosen F-set + calibration decision) on **2025**, alongside **all pre-registered baselines (B0–B5)** and the runner-up, computing **all** metrics (log loss, RPS, Brier, ECE), **calibrated and uncalibrated**, with 95% CIs. **It changes no selection decision.**
- **Access:** **only the project owner**, after dev selection is **frozen and git-tagged** (protocol + selected pipeline + dataset snapshot id).
- **When:** after the §14 checklist is fully ticked.
- **Rerun:** **not permitted.** A single committed script evaluates everything in **one pass** and writes results to an **immutable** record (and the public anchor repo).
- **If the champion fails on the test** (e.g., does not beat the best baseline OOT by the practical threshold): **report it honestly and deploy the pre-registered fallback** (the best baseline). Failing OOT is a **valid result**, not a trigger to tune.
- **No selective omission:** the report includes **every** pre-registered metric for **every** pre-registered model on 2025 — not only the champion's best figure. Sample sizes and the market-subset caveat are stated.
- **Methodology changes after viewing the test:** the 2025 test is **burned**; any change requires a **new protocol version** and a **newly reserved untouched season** (which costs data — the reason for the discipline).

---

## 12. Experiment-run schema

Every run (baseline eval, dev fold set, calibration fit, final test) records:

| Field | Description |
|---|---|
| `run_id` | UUID |
| `protocol_version` | e.g., `1.0` |
| `dataset_version` | `ds-mls-2012_2025-<YYYYMMDD>-<sha8>` |
| `feature_set_version` | `fs-v1` + selected subset (e.g., `F2`) |
| `code_commit` | git SHA |
| `environment` | container image digest + dependency lockfile hash |
| `random_seed` | e.g., `42` |
| `hyperparameters` | full dict (e.g., `{model: logistic, C: 1.0}`) |
| `fold_definitions` | walk-forward block boundaries (dates) |
| `metrics` | log loss, RPS, Brier, ECE (+ CIs); per-fold and pooled |
| `artifacts` | S3 URIs (model, calibration, predictions, reliability plots) |
| `start_time`, `end_time` | UTC timestamps |
| `status` | `running / complete / failed / superseded` |
| `notes` | free text (e.g., "RQ4 challenger; gate not met") |
| `is_final_test` | boolean (true for the single 2025 run) |

Runs are append-only; a superseded run is retained.

---

## 13. Protocol-change policy

- **Versioning (semantic):** **MAJOR** = any change to the dataset policy, temporal split, or final-test season; **MINOR** = added experiments/RQs that do **not** touch the sealed test; **PATCH** = clarifications/typos.
- **Pre-results changes:** freely allowed before any dev results are observed; bump PATCH/MINOR and re-tag.
- **Post-dev-results changes:** allowed but require a **version bump with written justification**; they must not be motivated by test-set knowledge (the test is still sealed).
- **Post-test changes:** viewing the 2025 test **freezes** this protocol version; any further methodological change requires a **new MAJOR version** and a **new reserved untouched season**. The burned season may not be reused as a test.
- **Pre-registration record:** this document is **git-tagged with its SHA before the first model is trained**; the tag is the pre-registration timestamp.

---

## 14. Pre-final-test checklist (one page)

> **Do not run the 2025 final test until every box is ticked, dated, and committed.**

**Pre-registration & freeze**
- [ ] Protocol v1.0 git-tagged **before** any training; tag SHA recorded.
- [ ] Dataset snapshot id `ds-mls-2012_2025-<…>` pinned and hash recorded.
- [ ] Included/excluded seasons and match rules match §2 exactly.

**Development complete (2018–2024 only)**
- [ ] Walk-forward ran with expanding window, **1-matchweek** blocks; everything refit per fold.
- [ ] Leakage assertions pass (feature-recompute parity; Elo excludes current match; no future-dated inputs; calibration slice past-only).
- [ ] Baseline ladder B0–B5 evaluated; RQ1–RQ2 decisions recorded with CIs.
- [ ] Logistic F0–F4 ablation (RQ7) complete; **F-set selected and frozen**.
- [ ] Hyperparameter grids stayed within the §6 budgets (≤20 logistic, ≤12 LightGBM); no extra trials.
- [ ] RQ3 (logistic vs best baseline) and RQ4 (LightGBM vs logistic) decided by the §10 matrix; **champion chosen**.
- [ ] RQ5 calibration decision (adopt temperature or not) recorded, judged **out-of-fold**.
- [ ] Probability-sum validation passes on all dev predictions.

**Selection sealed**
- [ ] Champion model + F-set + hyperparameters + calibration decision **frozen and committed** (no further tuning possible).
- [ ] Pre-registered **fallback** (best baseline) named, in case the champion fails OOT.
- [ ] The single final-test script is written to evaluate **all** pre-registered models on 2025 in **one pass** and write immutable results.

**Integrity**
- [ ] 2025 has **never** been loaded into any selection/tuning/plotting step.
- [ ] Reviewer (or written self-attestation) confirms no test-set peeking.
- [ ] Reporting template lists **every** metric for **every** model (no selective omission), with CIs, sample sizes, and the market-subset caveat.

> Once all boxes are ticked: run the final test **once**. Record results immutably. **Do not iterate.**

---

**Protocol status:** pre-registered and decision-complete. Development may proceed on 2018–2024; the 2025 test is sealed until the §14 checklist is satisfied and is executed exactly once.
