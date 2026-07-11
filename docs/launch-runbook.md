# Launch runbook — from "deployed" to "live"

Everything is deployed (M8). This is the exact ordered sequence to go live for MLS resumption
(first fixtures **Jul 16–18, 2026**). Steps marked **[dev]** are developer-only.

## 0. One-time enablement (do anytime now)
- [ ] **[dev]** Click the **SNS subscription confirmation** email from AWS (else alarms/budget
      can't reach you).
- [ ] **[dev]** Add repo secrets for CI/CD: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and
      `NEON_DATABASE_URL` (Settings → Secrets and variables → Actions). Enables `deploy.yml` +
      `train.yml`.
- [ ] **[dev]** Add branch protection on `main`: require the **CI** workflow green before merge
      (this is how "no merge without leakage tests" is enforced).

## 1. The touch-once 2025 test (the one irreversible scientific step)
- [ ] **[dev]** Sign the last §14 box: add the self-attestation line to
      `docs/pre-final-test-checklist.md` ("I confirm 2025 was never used in selection/tuning —
      <name>, <date>") and ✅ the box.
- [ ] Run once, together:
      `KICKLENS_RUN_FINAL_TEST=yes-i-am-sure DATABASE_URL=<neon> uv run python -m models.run_final_test`
      (triple-gated; refuses if any box is unticked or if it has run before).
- [ ] Fill `docs/final-test-report-template.md` from `experiments/final_test_2025.json`.
      **Report whatever it says** — this freezes protocol v1.0.

## 2. Production model
- [ ] Train the launch model on 2017–2025 and promote it (guard now satisfied by step 1):
      `DATABASE_URL=<neon> uv run python -m models.train_production --promote`
- [ ] Verify `GET /model-versions` shows one `is_production: true`.

## 3. Anchor push (tamper-evidence goes public)
- [ ] **[dev]** Create a GitHub **fine-grained PAT** (contents: read/write on this repo) and put
      it in SSM: `aws ssm put-parameter --name /kicklens/GITHUB_ANCHOR_TOKEN --type SecureString
      --value <pat>`. (Wiring the inference job to push `anchors/*.jsonl` is the only remaining
      code task — small; do it in the T-261 session.)

## 4. Arm the live loop (T-261)
- [ ] First, a dry ingest to populate current fixtures:
      `aws lambda invoke --function-name kicklens-ingest --payload '{}' out.json`
      then confirm `GET /matches/upcoming` lists the Jul 16–18 fixtures.
- [ ] Enable the EventBridge rules (they ship **DISABLED**):
      `for r in ingest-morning ingest-evening feature-hourly inference-hourly grade-2h
      merkle-daily; do aws events enable-rule --name kicklens-$r; done`
- [ ] Watch the first fixture cross **T-3h**: an official forecast finalizes, freezes, hashes,
      and its anchor line appears in `anchors/<date>.jsonl` **before kickoff**. That is M9.

## 5. First grade (M10)
- [ ] ~2h after the first full-time, the grade job writes the grade and the **live** metrics
      snapshot; `GET /performance?scope=live` shows n=1 (honestly tiny). Live record has begun.

## Rollback / safety
- Missed cutoff → honest "no forecast issued" (never back-filled). Provider down → last-known
  data + stale banner. Bad model → repoint `is_production` to the prior version (registry
  `promote`). Budget > $4 → email; investigate before it hits $5.
