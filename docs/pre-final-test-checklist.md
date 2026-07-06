# Protocol §14 pre-final-test checklist — live tick state

> The 2025 final test (T-260) runs ONLY when every box is ticked, dated, committed.
> Last updated 2026-07-06. Unticked items are listed with exactly what closes them.

**Pre-registration & freeze**
- [ ] **Protocol v1.0 git-tagged before any training** — *DEVELOPER ACTION:* tag the pre-build
  commit that introduced the protocol doc (predates all experiment code/runs), e.g.
  `git tag -a protocol-v1.0 <sha-of-docs-commit> -m "pre-registration"` + push the tag; record
  the SHA here.
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
- [ ] **The single final-test script exists** evaluating ALL pre-registered models (champion,
  B0–B5) on 2025 in one pass with immutable output — *to be written as T-260 prep; must be
  reviewed BEFORE it is ever executed.*

**Integrity**
- [x] 2025 never loaded into any selection/tuning step — structurally enforced
  (`walkforward.load_dev_samples` hard-caps at 2024) and true of every recorded run. *(2026-07-06)*
- [ ] **Written self-attestation of no test-set peeking** — *DEVELOPER ACTION at T-260 time.*
- [ ] Reporting template listing every metric for every model, with CIs, sample sizes, market
  caveat — *to be written with the final-test script.*

> When all boxes are ticked: run once, record immutably, do not iterate.
