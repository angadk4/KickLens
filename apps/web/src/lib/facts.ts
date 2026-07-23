// Sealed-run facts rendered in site prose — ONE definition per figure so two pages can
// never disagree (the Engineering test-count contradiction was exactly this bug). Every
// constant cites its source document; update on retrain / re-seal (and on a new green CI
// run for the test counts) — never by editing page copy directly.

// ——— test suite (Engineering page + architecture diagram) ———
// The count of the suite THIS deploy ships with: 199 passed, 1 skipped against the real
// Postgres service container (verified locally 2026-07-23; the prior green CI run,
// 29968808965, showed 197 before this change set added its 2 tests — the page deploys with
// the push that makes it 199). The skip is data-gated: a market-aggregation check
// (tests/test_market.py) that needs the full historical dataset, which a fresh CI database
// doesn't hold; the recompute-parity leakage checks with the same need run in the sealed
// training environment, where the history is loaded.
export const TESTS_CI_PASSED = 199;
export const TESTS_CI_SKIPPED = 1;
/** UTC date the counts above were verified. */
export const TESTS_ASOF = "2026-07-23";

// ——— seal & evaluation dates (ISO everywhere — one format site-wide) ———
/** Dev selection sealed: model + calibration frozen before the test — docs/selection.md. */
export const DEV_SEAL_DATE = "2026-07-06";
/** The touch-once 2025 test's single evaluation — docs/final-test-report-2025.md. */
export const TEST_EVAL_DATE = "2026-07-12";

// ——— calibration, dev walk-forward (docs/selection.md · update on retrain) ———
/** Raw (uncalibrated) logistic F1 ECE — docs/selection.md RQ5 table ("0.0320"). */
export const ECE_DEV_RAW = 0.032;
/** De-vigged Pinnacle closing market ECE on the identical 3,012 matches — docs/selection.md. */
export const ECE_DEV_MARKET = 0.0196;
/** Champion (logistic + temperature) ECE — docs/selection.md, docs/model-card.md ("0.0108"). */
export const ECE_DEV_CHAMPION = 0.0108;
/** B3 Elo baseline ECE — docs/baselines.md ladder row B3 (display precision 0.030). */
export const ECE_DEV_B3 = 0.03;
/** Mean fitted temperature across dev walk-forward folds — docs/selection.md ("Mean fitted T = 1.157"). */
export const DEV_MEAN_FOLD_T = 1.157;

// ——— champion vs B3 Elo (docs/selection.md: paired diff +0.00012 [−0.00296, +0.00304]) ———
/** Paired log-loss diff at display precision; the CI includes zero → equivalence, no superiority claim. */
export const CHAMPION_VS_B3_DELTA_NATS = "+0.0001";

// ——— market-reference log loss (update on retrain) ———
/** De-vigged Pinnacle closing on the dev walk-forward — docs/selection.md ("log loss 1.0149"). */
export const MARKET_LOG_LOSS_DEV = 1.0149;
/** The same market on the sealed 2025 test — docs/final-test-report-2025.md ("1.0317"). */
export const MARKET_LOG_LOSS_TEST = 1.0317;

// ——— always-home diagnostic accuracy (accuracy is a diagnostic, never a criterion) ———
/** 2025 home-win rate = always-home accuracy on the test — docs/final-test-report-2025.md, docs/spikes/E6-sample-size.md. */
export const ALWAYS_HOME_ACC_TEST = "43.7%";
/** Always-home accuracy on the dev walk-forward — docs/baselines.md B1 row (acc 0.488; B1's top pick is always home). */
export const ALWAYS_HOME_ACC_DEV = "≈48.8%";

// ——— operational shape (infra/terraform: schedules.tf · alarms.tf) ———
/** EventBridge cron rules: ingest 08/20 + results-only 01–06 (ADR-005) + feature :10 +
    inference :20 + grade 2h + merkle 12:00 + odds :05 + canary 09:00. */
export const CRON_RULES = 9;
/** CloudWatch alarms: 6 job Errors + 6 job Throttles + api 5xx — alarms.tf. */
export const ALARM_COUNT = 13;

// ——— leakage-suite scale (Engineering invariants) ———
/** Stored feature rows recompute-parity-verified bit-for-bit at the dev seal — docs/fs-v1.md,
    docs/leakage-tests.md R1. Grows with the live loop; this is the sealed count. */
export const RECOMPUTE_PARITY_ROWS = 5763;
