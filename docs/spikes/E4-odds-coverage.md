# Spike (T-004) — Historical odds suitability + coverage

**Date:** 2026-07-05 · **Verdict:** **GO** — the historical market benchmark is viable with
near-total coverage; closing-only confirmed.

Source: `new/USA.csv` (downloaded 2026-07-05), regular-season rows after the T-001 R1 playoff
filter (see `E1-playoffs.md`).

## Findings

1. **Closing-only confirmed.** The file's odds columns are exactly
   `PSC*` (Pinnacle closing), `MaxC*`, `AvgC*`, `BFEC*` (Betfair Exchange closing), `B365C*` —
   all closing; **no opening-odds and no capture-timestamp columns exist.** The Contract's
   "stronger-information reference" framing (closing odds see more than a T-3h model) stands, and
   the selection-bias caveat is moot: coverage is near-total (below).
2. **Pinnacle closing coverage, era 2017–2025 (regular season): 3,895 / 3,896 = 99.97%.**
   Per-season coverage is 100.0% for every season except 2020 (291/292 = 99.7%); the single
   missing match is **2020-08-22 Toronto FC vs Vancouver Whitecaps**. `AvgC*` and `MaxC*` are
   100.0% in every era season.
3. **Odds are plausible closing 3-way prices.** Implied overround (1/H + 1/D + 1/A) across the
   3,895 era matches: min 1.0122, median 1.0310, max 1.0633 — the expected range for closing
   three-way markets; no degenerate or stale prices detected.
4. **⚠ Current season (2026): `PSC*` is empty (0/218) so far**, while `AvgC*` (218/218),
   `MaxC*` (218/218) and `B365C*` (218/218) are populated. If Pinnacle columns stay absent for
   2026, the historical closing benchmark for the live season should fall back to `AvgC*`
   (already the Contract's consensus reference). Logged in Dependency Verification; re-check at
   first live ingestion.

## Coverage table (regular-season rows, PSC* all three prices non-null)

| Season | Matches | PSC* | % | AvgC* % |
|---|---|---|---|---|
| 2017 | 374 | 374 | 100.0 | 100.0 |
| 2018 | 391 | 391 | 100.0 | 100.0 |
| 2019 | 408 | 408 | 100.0 | 100.0 |
| 2020 | 292 | 291 | 99.7 | 100.0 |
| 2021 | 459 | 459 | 100.0 | 100.0 |
| 2022 | 476 | 476 | 100.0 | 100.0 |
| 2023 | 493 | 493 | 100.0 | 100.0 |
| 2024 | 493 | 493 | 100.0 | 100.0 |
| 2025 | 510 | 510 | 100.0 | 100.0 |
| **2017–2025** | **3,896** | **3,895** | **99.97** | **100.0** |
| 2026 (partial) | 218 | 0 | 0.0 | 100.0 |

(2012–2016 pre-era seasons: 100% PSC*/AvgC* as well — usable for the post-MVP era-sensitivity check.)

## Decisions confirmed

- **Market-comparison subset = era matches with non-null `PSC*`** — effectively the whole era
  (one exclusion). No material selection bias; the caveat reduces to a footnote naming the one match.
- Primary historical reference = **Pinnacle closing (`PSC*`)**; consensus = **`AvgC*`** — as frozen
  in Contract §5. New: **fallback to `AvgC*` where `PSC*` is null** (1 era match; possibly all of 2026).

## Tests run (real output summarized)

- Column scan: non-closing/non-core columns = **NONE**.
- Per-season non-null counts computed for all five bookmaker column groups (table above);
  spot-check season 2023: 493 rows, 493 with full PSC — matches the R1 row count from E1.
- Overround sanity: n=3,895, min=1.0122, median=1.0310, max=1.0633.
