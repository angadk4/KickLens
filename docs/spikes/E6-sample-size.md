# Spike E6 (T-008) — Sample size, era start, calibration-slice sufficiency

**Date:** 2026-07-05 · **Verdict:** **GO (BL-4)** — 2017 era start confirmed; the ≥150-match /
≥30-draw calibration floor is comfortably met for all but the earliest walk-forward folds, which
use the Protocol's designed uncalibrated fallback.

Input: `new/USA.csv` regular-season rows after the T-001 R1 playoff filter.

## Per-season clean regular-season counts (H/D/A)

| Season | Matches | H | D | A | H% | D% | A% |
|---|---|---|---|---|---|---|---|
| 2012 | 323 | 167 | 77 | 79 | 51.7 | 23.8 | 24.5 |
| 2013 | 323 | 163 | 82 | 78 | 50.5 | 25.4 | 24.1 |
| 2014 | 323 | 156 | 89 | 78 | 48.3 | 27.6 | 24.1 |
| 2015 | 340 | 183 | 72 | 85 | 53.8 | 21.2 | 25.0 |
| 2016 | 340 | 169 | 107 | 64 | 49.7 | 31.5 | 18.8 |
| **2017** | 374 | 208 | 90 | 76 | 55.6 | 24.1 | 20.3 |
| 2018 | 391 | 211 | 83 | 97 | 54.0 | 21.2 | 24.8 |
| 2019 | 408 | 213 | 92 | 103 | 52.2 | 22.5 | 25.2 |
| 2020 | 292 | 138 | 69 | 85 | 47.3 | 23.6 | 29.1 |
| 2021 | 459 | 220 | 124 | 115 | 47.9 | 27.0 | 25.1 |
| 2022 | 476 | 232 | 118 | 126 | 48.7 | 24.8 | 26.5 |
| 2023 | 493 | 234 | 146 | 113 | 47.5 | 29.6 | 22.9 |
| 2024 | 493 | 221 | 120 | 152 | 44.8 | 24.3 | 30.8 |
| **2025 (test)** | 510 | 223 | 128 | 159 | 43.7 | 25.1 | 31.2 |

- **Dev 2017–2024: 3,386 matches, 842 draws.** Test 2025: 510 matches, 128 draws.
  Era 2017–2025: 3,896 matches (reconciles exactly with E1/E4 counts).
- Draw rate is stable (21–31% per season, era mean 24.9%) — every season clears ≥30 draws on its
  own by a wide margin.
- Note the drift in home-win rate (55.6% in 2017 → ~44% in 2024–25) — supports walk-forward
  (recency-respecting) validation and per-fold refit; worth a line in the model card later.

## Calibration-slice sufficiency (trailing 20% of each expanding fold's training window)

Simulated with ISO-week blocks as the matchweek proxy (241 fold positions across dev; the real
harness in T-080 uses schedule-defined matchweeks — conclusions are insensitive to the proxy):

- The **≥150 matches / ≥30 draws floor is first met at train ≈ 754 matches (late Oct 2018)** and
  is met for **every fold thereafter** — through end of dev the slice grows to 677 matches /
  ~168 draws.
- Representative folds: start-2020 slice = 235 matches / 52 draws; start-2022 = 385 / 106;
  start-2024 = 579 / 165.
- Folds before late-Oct 2018 fail the floor and **fall back to uncalibrated raw probabilities**,
  exactly as the Protocol prescribes (Protocol §7 table: "otherwise fall back to uncalibrated").
  This affects only the earliest ~1.5 dev seasons of walk-forward *evaluation*; the frozen
  model+calibration used for the 2025 touch-once test trains on all of dev (slice 677/≈168 —
  4.5× the floor) and the production model on 2017–2025 is larger still.

## Decisions recorded

1. **Era start = 2017 confirmed** (Contract E6 frozen resolution stands). 2012–2016 (1,649
   matches) remain available for the post-MVP era-sensitivity check only.
2. **Calibration floor ≥150/≥30 is feasible** — no protocol change, no MINOR bump needed.
3. **Recommendation for T-080 (gap the docs don't answer):** the docs define the expanding
   walk-forward but not the first *evaluated* block. Recommend **2017 as burn-in (training-only);
   first evaluated block = first matchweek of 2018**. Rationale: a fold with weeks of training
   data produces meaningless evaluation; with a 1-season burn-in only ~34 early-2018 folds use the
   uncalibrated fallback and every fold has ≥374 training matches. This fills a TBD; it does not
   alter the frozen dev window (2017–2024 all remain in dev; 2017 is simply never a *test* block).
   To be implemented + asserted in T-080; flagged at checkpoint.

## Tests run (real output summarized)

- Counts reconcile: per-season H+D+A sums equal the filtered totals; era sum 3,896 = E1's
  374+391+408+292+459+476+493+493+510. ☑
- Floor simulation over 241 expanding folds: 66 sub-floor folds if evaluation started day-1 2017;
  34 if it starts at 2018 (recommended); 0 after 2018-W43. ☑
