# SoccerEdge Final Pre-Build Review

**Reviewer role:** CTO and principal ML engineer, personally accountable for the decision to begin development.
**Documents reviewed:** Master Specification v2.0 · Adversarial Review · Build Contract v2.1 · External Dependency Verification · ML Experimental Protocol v1.0 · Implementation Plan & Backlog v1.0.
**Scope of this review:** decide whether the existing plan is valid and precise enough to build. **No new scope, no feature proposals, no rewrite.**

---

## 1. Final verdict

# ▶ GO WITH CONDITIONS

The methodology, data design, audit model, architecture, and cost plan are sound and internally consistent; the major V1 defects were found and corrected; the backlog is dependency-ordered with fallbacks. **Development is authorized to begin — starting with the pre-build spike phase (M0) only.** Progression past M0 is gated on a small set of conditions (Section 3): the three blocking data spikes must return GO (or adopt their documented fallbacks), the dataset's match/draw counts must be confirmed sufficient, and a finishable scope/calendar must be committed. None of these is a structural defect; each is an empirical verification or a commitment that must be closed before the dependent milestone, not before the first keystroke.

A plain GO is withheld because the live data feed the centerpiece depends on (E2) and the legal/display basis for the market comparison (E3) are verified only at the documentation level, not by a live call, and because the project has not yet committed to a scope/calendar that its own bottom-up estimate shows is achievable. A NO-GO is unwarranted: nothing in the plan is unbuildable, and every open item is cheap to resolve with a defined fallback.

---

## 2. Scorecard

Score 0–5 (5 = fully specified, verified, no material residual). "Blocking?" → No · Cond→Mx (a condition gating milestone x) · —.

| Category | Score | Evidence | Remaining issue | Blocking? |
|---|---|---|---|---|
| Forecasting problem definition | 5 | Contract: regulation-time 1X2; one official forecast at kickoff−3h; frozen + hashed | None | No |
| Match inclusion rules | 4 | Contract: RS-only; explicit exclusions (playoffs/Leagues Cup/USOC/CONCACAF/friendlies/intl) | Playoff *filterability* in historical file unverified (E1) | Cond→M1 |
| Official prediction timing | 5 | Contract: T−3h cutoff; drafts vs official; postponement → void+new | None | No |
| Data-source verification | 4 | Dependency Verification: sources web-confirmed w/ citations (USA.csv "updated 26/05/26"; API-Football current-season; football-data.org for La Liga) | Free-tier live behavior not empirically called (E2) | Cond→M1 |
| Historical-data sufficiency | 3 | 2017–2025 MLS RS (~9 seasons); era choice documented | Per-season match/draw counts unconfirmed; single-season OOT test is modest (E6/T-008) | Cond→M4 |
| Historical-odds validity | 3 | Verified closing-only, provider-labelled, no capture timestamps; coverage count pending (T-004) | Closing-only is a permanent limitation; subset size unknown | No (fallback) |
| Point-in-time correctness | 4 | Contract/Protocol: as-of T−3h features; Elo excludes current match; season_progress from published schedule | Must be proven by the leakage suite at build time | No |
| Leakage prevention | 5 | Protocol §3A + Backlog T-064: R1–R8 leakage tests gate downstream; per-fold refit; calibration-slice past-only | None (design); verification is a build task | No |
| Feature definitions | 5 | Contract §6: fs-v1 fully enumerated; removed features documented; nested F0–F4 | None | No |
| Baseline definitions | 5 | Protocol §5: B0–B5 incl. Poisson + Dixon-Coles, ordered ladder | None | No |
| Model-development protocol | 5 | Protocol §1/§6: pre-registered; logistic champion; LightGBM challenger ≤12; seeds/budgets/tie-breaks | None | No |
| Calibration protocol | 4 | Protocol §7: temperature scaling; OOF evaluation; floor ≥150/≥30 draws; fallback uncalibrated | Sample sufficiency unconfirmed (ties to E6) | Cond→M4 |
| Temporal validation | 5 | Protocol §3: expanding walk-forward; 1-matchweek blocks; refit per fold; 2017 warm-up | None | No |
| Final-test isolation | 5 | Protocol §11/§14: touch-once 2025; one-shot script; changes-no-decision; burn-on-peek; checklist | None | No |
| Market comparison fairness | 4 | Contract/Protocol: benchmark-not-"beat"; closing = stronger-info reference; same-cutoff only live & conditional; vig removal; aggregate-only display | Live feasibility (E3); permanent closing-vs-cutoff asymmetry | No (fallback) |
| Statistical uncertainty | 5 | Protocol §9: paired diffs; matchweek block bootstrap 2000; 95% CI; ≥0.005 nats + CI-excludes-0; multiple-comparison policy | None | No |
| Prediction auditability | 5 | Contract: write-once row + append-only event ledger + SHA-256 + public Git anchor + daily Merkle | None | No |
| Historical replay separation | 5 | Contract/Protocol: backtest vs dev-validation vs OOT vs live; evidence types separated (V1 honesty bug fixed) | None | No |
| Database design | 4 | Contract §13/§35: fixture-id+revision; natural key for history; no kickoff-date key; write-once prediction; partial unique index | Neon pooling from no-VPC Lambda unverified (E7) | Cond→M8 |
| Job orchestration | 4 | Contract: EventBridge crons + DB advisory-lock choreography (no Step Functions); idempotency; state-gating | Choreography correctness proven only at build (race tests planned) | No |
| Reproducibility and lineage | 5 | Contract/Protocol §12: raw→snapshot→training_run→artifacts→model_version→prediction(+hash)→grade→metrics; SHA/seed/env | None | No |
| Model promotion and rollback | 4 | Contract: manual promotion; is_production flag + partial unique index; monthly retrain; online Elo; pre-registered baseline fallback | Rollback is implied (flip flag); runbook step is light | No |
| Monitoring | 4 | Contract/Backlog T-240: op/DQ/model monitors (success, stale, reject rate, PSI>0.2, prob validity, rolling log loss); SNS | Label lag delays model-quality alerts (inherent) | No |
| Failure recovery | 4 | Contract: retry 5/25/125s; provider failover; last-known serve + freshness; void+new; regrade; anchor push retry | None material | No |
| Cloud architecture | 4 | Dependency Verification: Lambda container (ML) + slim-zip API + API GW + **no VPC** + CloudFront + S3 + EventBridge + SSM; verified vs 250 MB/10 GB limits | Container size (T-006) + Neon-from-Lambda (E7) to confirm; PaaS escape hatch documented | Cond→M8 |
| Cost verification | 5 | Dependency Verification: no NAT (no-VPC), SSM not Secrets Manager, Neon free, RDS rejected, 14-day logs, Budgets $5, CloudFront always-free | None | No |
| Testing plan | 5 | Backlog §8: leakage (top priority), unit, DQ, reconciliation, write-once, bootstrap determinism, calibration, audit/freeze, idempotency/race, outage, API contract, e2e, deploy smoke | None | No |
| MVP scope | 5 | Contract/Backlog: single league, 1X2, no accounts/xG/lineups; explicit MVP vs post-MVP; "never cut" rigor list | None | No |
| Timeline realism | 2 | Backlog §12: bottom-up most-likely ~150–240 h vs stated 45–60 h target | No committed reconciliation (extend calendar **or** adopt reduction ladder) | Cond→M1 |
| Backlog readiness | 4 | Backlog: ~52 tickets, dependency-ordered, AC/tests/fallback each; first-ten detailed; critical path + parallelization + reduction ladder | Non-first-ten fields are compact; some tickets bundle sub-tasks (doc-quality only) | No |

**Aggregate:** strong methodology and integrity (predominantly 5s), sound architecture/cost/testing (4s–5s), three empirically-unverified data items (3s), and one genuine weak spot — timeline realism (2). Mean ≈ 4.3. Consistent with **GO WITH CONDITIONS**.

---

## 3. Blocker list

These are the conditions on the verdict — each gates a specific milestone, not the first keystroke. ("Owner" maps to the single developer wearing the named hat.)

### BL-1 — Current-season MLS data acquisition unverified (live loop)
- **Exact issue:** the live freeze-and-grade loop (the centerpiece) requires current-season fixtures and final results on a free tier; this is confirmed only from provider documentation, not a live call.
- **Document section:** Dependency Verification (live results); Backlog T-002 (E2).
- **Required action:** run T-002 — call API-Football free tier for current MLS fixtures + ≥1 finalized result; capture team ids.
- **Owner:** developer (data engineer).
- **Evidence for closure:** saved sample of current-season fixtures and a finalized result whose score matches an independent source; rate-limit headers recorded.
- **Maximum time box:** 4 h.
- **Fallback if unresolved:** Highlightly backup adapter; if both fail, re-scope the live league (escalate before M1).

### BL-2 — Free three-way MLS odds + display rights unverified (market comparison)
- **Exact issue:** the live same-cutoff market comparison needs a free three-way (incl. draw) MLS odds feed near T−3h **and** ToS permission to display aggregates; The Odds API charges for MLS.
- **Document section:** Dependency Verification (live odds); Backlog T-003 (E3).
- **Required action:** run T-003 — confirm SportsGameOdds/Highlightly return MLS h2h with a draw price and timestamp; read the redistribution/display ToS.
- **Owner:** developer (data engineer) + the same person as licensing reviewer.
- **Evidence for closure:** sample payload with three timestamped outcomes; an explicit ToS finding on aggregate display; a recorded IN/OUT decision.
- **Maximum time box:** 3 h.
- **Fallback if unresolved:** drop the live comparison; keep the historical closing-odds **aggregate-only** reference (already designed). This preserves the MVP.

### BL-3 — Playoff presence/filterability in the historical file unverified (evaluation validity)
- **Exact issue:** `new/USA.csv` has no stage/round column; if MLS Cup playoff matches are present and not cleanly separable, training mixes competitions and biases league-strength estimates.
- **Document section:** Dependency Verification (USA.csv structure); Backlog T-001 (E1).
- **Required action:** run T-001 — cross-check late-season rows against known RS end dates and the live API's round labels; define a deterministic exclusion rule.
- **Owner:** developer (data engineer).
- **Evidence for closure:** a documented filter rule (or a finding that none are present), with example excluded dates, and a known MLS Cup final shown excluded.
- **Maximum time box:** 3 h.
- **Fallback if unresolved:** restrict training to confirmed RS date windows and document the residual exclusion risk.

### BL-4 — Historical match/draw counts unconfirmed (test power + calibration sufficiency)
- **Exact issue:** the calibration floor (≥150 matches / ≥30 draws per fold slice) and the power of the single-season 2025 OOT test depend on real per-season counts that have not been tallied.
- **Document section:** Protocol §7/§3; Backlog T-008 (E6).
- **Required action:** run T-008 — tally clean RS matches and H/D/A counts per season after the E1 filter; estimate each fold's trailing-20% calibration-slice size.
- **Owner:** developer (ML lead).
- **Evidence for closure:** a per-season counts table; a recorded decision that the era start and calibration floor are met (or a documented era extension via a MINOR protocol bump).
- **Maximum time box:** 3 h.
- **Fallback if unresolved:** extend the era (e.g., add 2015–2016) or widen reported CIs and label the test as low-power; record as a protocol-version note.

### BL-5 — No committed finishable scope/calendar (plan can realistically finish)
- **Exact issue:** the backlog's own estimate (~150–240 h most-likely) is 3–4× the stated 45–60 h target; without a committed reconciliation, the executed plan risks not finishing.
- **Document section:** Backlog §12 (effort) and §10 (scope-reduction ladder).
- **Required action:** before entering M1, commit in writing to **either** (a) a ~6–10-week part-time calendar for full scope, **or** (b) the reduction ladder (drop LightGBM, drop live odds, AWS→PaaS if needed, frontend to one performance view) to fit ~70–100 h — while preserving the "never cut" rigor list.
- **Owner:** developer (acting PM) + CTO sign-off (self).
- **Evidence for closure:** a one-line committed scope/calendar statement appended to the backlog.
- **Maximum time box:** 1 h (a decision, not work).
- **Fallback if unresolved:** default to ladder option (b); do not attempt full scope on the 45–60 h budget.

### BL-6 — Deployment-readiness spikes (architecture can support the workflow) — gates M8 only
- **Exact issue:** two architecture assumptions are unconfirmed: the ML container fits Lambda (≤10 GB, acceptable cold start) and Neon's pooled endpoint is stable from a no-VPC Lambda under burst.
- **Document section:** Dependency Verification (Lambda/Neon); Backlog T-006, T-007.
- **Required action:** run T-006 (build/push/deploy the image, measure cold start) and T-007 (concurrency test against Neon's pooled endpoint) before M8.
- **Owner:** developer (infra).
- **Evidence for closure:** image size + cold-start figures; a clean concurrency log with no "too many clients".
- **Maximum time box:** 5 h combined.
- **Fallback if unresolved:** PaaS (Render/Fly.io) + GitHub Actions scheduler; Supabase in place of Neon. Both documented; neither harms methodological rigor.

> No other issue meets the blocker definition. Items below are explicitly **non-blocking**.

---

## 4. Non-blocking risks (development may proceed)

- **Closing-vs-cutoff information asymmetry (permanent):** historical odds are closing-only with no timestamps, so historical "model vs market" is not a same-information contest. Handled honestly (labelled a stronger-information reference; same-cutoff comparison only live). Risk: a reader over-interprets the gap — mitigated by the methodology page and CIs.
- **Single-season OOT test power:** 2025 (~one season) yields wide CIs. Acceptable if results are reported with CIs and not over-claimed.
- **Label lag in monitoring:** model-quality alerts lag until matches are graded. Inherent; operational alerts (jobs, freshness, cost) are timely.
- **Expansion-team / cold-start noise:** early-season new-team predictions are noisier. Mitigated by Elo init + cold-start flags; just don't headline early-season accuracy.
- **2026 World Cup window compression:** the build/backtest happens during the pause; the live launch targets the ~July 16 resumption. Schedule risk if the build slips past resumption — mitigated by the reduction ladder and by the fact that the live loop can arm on any later matchweek.
- **Single-source history (football-data.co.uk):** one provider for pre-current odds/results. Mitigated by snapshotting the raw file + hash; no live dependency on it after ingestion.
- **Neon scale-to-zero cost gotcha:** aggressive frontend polling could keep the DB warm and erode the free tier. Mitigated by avoiding auto-poll and by the $5 Budgets alarm.
- **Solo bus-factor / scope-creep temptation:** one developer, ambitious spec. Mitigated by the frozen-decision list (Section 5) and the change-control discipline in the protocol.
- **Compact backlog fields / bundled sub-tasks:** a documentation-quality matter only; can be expanded on demand. Not a build risk.

---

## 5. Decisions that are now frozen

These must not be changed casually during implementation. Changing any requires an explicit decision record (and, for evaluation rules, a protocol-version bump per Protocol §13).

**Product.** MLS regular season only (league-extensible schema); 1X2 regulation-time target only; exactly one official forecast per fixture at kickoff−3h, frozen + hashed; no user accounts, no xG, no lineups in MVP; odds are a **benchmark, never a "beat the market" claim**; **aggregate-only** odds display (no raw-odds redistribution — licensing).

**Data.** Historical = football-data.co.uk `new/USA.csv`, seasons 2017–2025; live results = API-Football primary, Highlightly backup; historical match key = natural key via alias map; live key = provider fixture id + revision; curated team-alias map is the identity source of truth.

**ML / evaluation.** Feature set `fs-v1` (nested F0–F4; no features beyond fs-v1 without a new protocol version); baseline ladder B0–B5 (incl. Poisson + Dixon-Coles); **multinomial logistic = champion**, LightGBM = challenger-only (default ship logistic); **temperature scaling** the only calibration method in v1.0; **log loss** the primary metric; expanding walk-forward with 1-matchweek blocks, refit per fold; **2025 = touch-once test** (changes no decision); matchweek block bootstrap (2000) with the ≥0.005-nats-and-CI-excludes-0 promotion gate.

**Architecture.** FastAPI; React + Vite + TS + Recharts; **Neon** (Supabase the only sanctioned fallback — **not** RDS); **Lambda outside any VPC**; one container image for jobs + slim-zip API behind API Gateway HTTP; training via GitHub Actions; S3 artifacts + Postgres `model_version` registry; **EventBridge crons + DB advisory-lock choreography** (no Step Functions); **SSM Parameter Store** (not Secrets Manager); Terraform; us-east-1; **dev + prod only** (no staging).

**Operational / integrity.** Write-once `prediction` row + append-only `prediction_event` ledger; SHA-256 + public Git anchor before kickoff + daily Merkle root; manual model promotion (owner) + monthly in-season retrain + online Elo; evidence types **dev / out-of-time test / backtest / live** never merged in API or UI; $5 Budgets alarm; 14-day log retention.

---

## 6. Permitted experiments (and their boundaries)

These remain genuinely open; the build will resolve them. **None may alter a frozen evaluation rule or touch the 2025 test.**

- **E4 — logistic vs LightGBM.** Boundary: ≤12 LightGBM configs, fixed seeds; promote only on the §10 gate; **default outcome = ship logistic**.
- **E5 — does temperature calibration help?** Boundary: judged **out-of-fold**; adopt only if it does not worsen OOF log loss or ECE; otherwise ship uncalibrated probabilities.
- **E3 — live odds feed (IN/OUT).** Boundary: included only if a free three-way MLS feed exists **and** aggregate display is permitted; otherwise historical closing-odds reference only.
- **E6 — era start / calibration-slice sufficiency.** Boundary: may extend the era or widen CIs via a **MINOR** protocol bump; may not shrink the calibration floor below ≥150/≥30 draws without recording the rationale.
- **F0–F4 feature-set selection.** Boundary: choose the **smallest** set within the practical threshold of the best; **no feature beyond fs-v1** without a new protocol version.
- **Infrastructure choice — container-vs-PaaS and Neon-vs-Supabase.** Boundary: decided by the T-006/T-007 spikes; either path must preserve the audit, lineage, and grading guarantees.

---

## 7. First-build authorization

**Authorized to start now:** the pre-build spike phase (M0).

- **Exact first implementation ticket:** **T-001 — Spike E1: are MLS playoffs in the historical file, and how are they filtered?** (Backlog §14.) It needs no dependencies and de-risks evaluation validity immediately.
- **Conditions under which the second ticket may begin:** the M0 spikes (**T-001, T-002, T-003, T-004, T-005, T-008**) are mutually independent and may run **in parallel**; formally, **T-002 (the live-MLS spike) may begin as soon as T-001 is underway or its go/no-go is logged** — there is no dependency between them. The hard gate is downstream, not between spikes:
  - **No M1 ticket (T-030 historical ingestion onward) may begin until BL-1 (E2) and BL-3 (E1) are GO** or their fallbacks are adopted and documented, and until **BL-5** (scope/calendar) is committed.
  - **The market-comparison tickets (T-110 / T-111 / T-142) branch on BL-2 (E3).**
  - **M4 calibration/selection (T-100/T-092) is gated on BL-4 (E6).**
  - **M8 deployment (T-220+) is gated on BL-6 (T-006/T-007).**

In short: start T-001 now, run the spike phase in parallel, and do not cross into M1 until the M0 conditions close.

---

## 8. Stop conditions (pause development and revisit the specification)

Development must **pause** and the relevant document must be revisited if any of the following occurs:

1. **A blocking data spike returns NO-GO and its fallback materially changes scope** — e.g., neither free tier serves current MLS results (BL-1 fallback exhausted): re-scope the live league before continuing.
2. **The leakage suite (T-064) cannot be made to pass** — stop before any modeling; revisit the feature/temporal design. Never model on features that fail leakage assertions.
3. **The 2025 touch-once test is accessed before selection is frozen** — burn the test, revisit the protocol, and reserve a new untouched season (Protocol §11/§13).
4. **Calibration-slice sufficiency fails badly (BL-4)** — pause; revisit the era or the calibration floor via a protocol-version bump.
5. **The $5 Budgets alarm trips** — pause infra; investigate for a NAT/VPC regression or aggressive polling before proceeding.
6. **The ML container exceeds Lambda limits and the PaaS fallback is also infeasible** — pause; revisit the architecture (BL-6).
7. **Realized effort exceeds the committed calendar by more than ~50% at a milestone checkpoint** — stop, invoke the scope-reduction ladder, and re-baseline before continuing.
8. **A licensing/ToS finding prohibits even aggregate display** — pause the market feature; revisit the data/display plan.
9. **A provider permanently removes free current-season access mid-build** — pause the live loop; revisit the data acquisition plan.

> Reaching a stop condition is not failure — it is the plan working as designed. The fallbacks and the reduction ladder exist precisely so a pause leads to a documented re-scope, not an abandoned project.

---

**Decision recorded.** Verdict: **GO WITH CONDITIONS.** Begin at **T-001**; close the M0 conditions (BL-1, BL-3, BL-5; then BL-2/BL-4 on their branches; BL-6 before M8) before advancing. The existing plan is valid and precise enough to build.
