// Sealed-run facts rendered in site prose — ONE definition per figure so two pages can
// never disagree (the Engineering test-count contradiction was exactly this bug). Every
// constant cites its source document; update on retrain / re-seal (and on a new green CI
// run for the test counts) — never by editing page copy directly.

// ——— the public record (ONE URL definition — pages must never hand-roll these) ———
/** The project repository — also the anchor repo (anchors/ lives in it). */
export const REPO_URL = "https://github.com/angadk4/KickLens";
/** The public anchor directory. Cards link the TREE, never a client-derived day file:
    the anchor day is the FREEZE day, not the kickoff day (match 6067 kicked off Jul 26
    but is anchored under Jul 25), so deriving a filename from kickoff is provably wrong.
    The exact file+line link lives in the proof bench, where the SERVER states the day. */
export const ANCHORS_URL = `${REPO_URL}/tree/main/anchors`;

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

// ——— calibration on the SEALED 2025 test (docs/final-test-report-2025.md · one pass) ———
// These exist as constants because the page copy around them was wrong once: it claimed the
// champion's ECE was "best of all eight evaluated", which silently counted the market among
// the pre-registered field and was false against the sealed JSON (see that report's
// 2026-08-02 correction). Keeping both numbers named, side by side, makes the true comparison
// the easy one to write.
/** Champion ECE on the touch-once test — best of the SEVEN pre-registered models. */
export const ECE_TEST_CHAMPION = 0.0272;
/** De-vigged closing market ECE on the identical 510 matches — better than the champion. */
export const ECE_TEST_MARKET = 0.0128;
/** Next-best pre-registered model's ECE (B3 Elo) — what "best of seven" is measured against. */
export const ECE_TEST_B3 = 0.0358;

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
/** CloudWatch alarms: 6 job Errors + 6 job Throttles + api Errors + api Throttles — alarms.tf.
    Was 13 until 2026-08-02: `api_throttles` shipped on 2026-07-26 and this constant never
    moved, so the Engineering page under-counted its own alarms for a week. `facts.test.ts`
    now derives both this and CRON_RULES from the Terraform itself so the drift cannot recur. */
export const ALARM_COUNT = 14;

// ——— the knew-nothing baseline (display precision) ———
/** Log loss of guessing ⅓/⅓/⅓ every match: ln 3 ≈ 1.0986. This is the DISPLAY constant
    (site copy, chart rule labels); lib/yourCall.ts keeps the full-precision value for
    computation. Both are pinned against Math.log(3) by tests. */
export const KNEW_NOTHING_LL = 1.0986;

// ——— small-sample display floor (one standard, every page) ———
/** Below this sample size a per-bucket breakdown (reliability curve, by-confidence chart)
    spreads the forecasts one or two per bucket: the per-bucket rates are noise, not
    evidence, so pages show the headline metric with its n instead of drawing the chart.
    Dev/test sit far above it and are never gated. */
export const MIN_N_BUCKET_DETAIL = 30;

// ——— leakage-suite scale (Engineering invariants) ———
/** Stored feature rows recompute-parity-verified bit-for-bit at the dev seal — docs/fs-v1.md,
    docs/leakage-tests.md R1. Grows with the live loop; this is the sealed count. */
export const RECOMPUTE_PARITY_ROWS = 5763;
