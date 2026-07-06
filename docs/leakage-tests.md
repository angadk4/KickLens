# Leakage test suite spec — R1–R8 (T-064, never-cut)

Suite: `tests/test_leakage.py`. CLAUDE.md §2.2: these may never be weakened, skipped, or
deleted; any leak blocks all downstream modeling (stop condition §4.2).

| Rule | Assertion | How tested |
|---|---|---|
| **R1** recompute parity | rebuilding any stored `feature_row` from raw history reproduces it bit-for-bit (values + `inputs_hash`) | crafted fixture + **all 5,763 stored rows** in the loaded DB |
| **R2** no future-dated inputs | flipping any later match's result leaves every earlier row bit-identical; every stored `as_of_utc` < its match's kickoff | fixture tamper test + DB scan |
| **R3** Elo excludes current | flipping a match's own result never changes its own `elo_diff` | fixture tamper test |
| **R4** windows exclude current | same flip never changes any form/venue-form feature of the match itself | fixture tamper test |
| **R5** schedule-only progress | flipping **every** result never changes `season_progress` | fixture tamper test |
| **R6** no future market data | no `market_snapshot` with `capture_time_utc <= as_of_utc` is joinable at cutoff (historical closing = at kickoff, i.e. after T-3h by construction) | DB scan |
| **R7** calibration slice past-only | `assert_calibration_slice_past_only(slice_max, block_min)` — the reusable assertion T-080/T-100 must call per fold | unit-tested here; wired in at T-080/T-100 |
| **R8** leak canary | a deliberately leaky builder variant (current match folded into its own form window) IS detected by the R3/R4 method | canary test |

The DB-layer tests build fs-v1 rows themselves if absent — the suite can skip only when no
historical data is loaded at all, never silently on missing features.
