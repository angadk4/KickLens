# Protocol §14 pre-final-test checklist — live tick state

> The 2025 final test (T-260) runs ONLY when every box is ticked, dated, committed.
> Last updated 2026-07-06. Unticked items are listed with exactly what closes them.

**Pre-registration & freeze**
- [x] **Protocol v1.0 git-tagged before any training** — tag `protocol-v1.0` (object
  `4a59ac3c94`) → commit `df73e3f2568321982f37e5a2183a57d35996c0d7`, the last docs/config-only
  commit preceding all experiment code and runs. Tagged + pushed by the developer *(2026-07-06)*.
- [x] Dataset snapshot pinned: `ds-mls-20260706-9d8cbcc3` (SHA-256 recorded in
  `dataset_snapshot` + runs.jsonl). *(2026-07-06)*
- [x] Included/excluded seasons + match rules match Protocol §2 (dev 2017–2024, R1 playoff
  filter, RS-only; verified by DQ suite + E6 count parity). *(2026-07-06)*

**Development complete (2018–2024 only)**
- [x] Walk-forward: expanding, 1-matchweek blocks, refit per fold (T-080; 210 folds). *(2026-07-06)*
- [x] Leakage assertions pass (R1–R8, incl. stored-row recompute parity). *(2026-07-06)*
- [x] Baseline ladder B0–B5 evaluated with CIs (`docs/baselines.md`). *(2026-07-06)*
- [x] Logistic F0–F4 ablation complete; **F1 selected and frozen**. *(2026-07-06)*
- [x] Grid budgets respected: 20/20 logistic, 12/12 LightGBM, no extra trials (runs.jsonl is
  the audit trail). *(2026-07-06)*
- [x] RQ3 (champion vs best baseline: equivalent, gate not cleared — recorded) and RQ4
  (LightGBM: does not ship) decided by the §10 matrix; **champion chosen**. *(2026-07-06)*
- [x] RQ5: temperature ADOPTED, judged out-of-fold. *(2026-07-06)*
- [x] Probability-sum validation on all dev predictions (enforced in metrics + model tests). *(2026-07-06)*

**Selection sealed**
- [x] Champion + F-set + hyperparameters + calibration frozen: `packages/models/champion.py`,
  developer-approved 2026-07-06.
- [x] Pre-registered fallback named: **B3 Elo ordinal**. *(2026-07-06)*
- [x] **The single final-test script exists**: `packages/models/run_final_test.py` — evaluates
  champion + B0–B5 + market on 2025 in one pass; triple-gated (this checklist parsed for
  unticked boxes / deliberate env flag / immutable-output-exists refusal); procedure
  pre-registered in its docstring; gate behavior unit-tested. Written 2026-07-06, **never
  executed**. *(Developer should read it once before the run.)*

**Integrity**
- [x] 2025 never loaded into any selection/tuning step — structurally enforced
  (`walkforward.load_dev_samples` hard-caps at 2024) and true of every recorded run. *(2026-07-06)*
- [ ] **Written self-attestation of no test-set peeking** — *DEVELOPER ACTION at T-260 time.*
- [x] Reporting template exists: `docs/final-test-report-template.md` — every metric for every
  model, CIs, sample sizes, market-subset caveat; no selective omission possible by
  construction (the script emits all of it). *(2026-07-06)*

> When all boxes are ticked: run once, record immutably, do not iterate.
