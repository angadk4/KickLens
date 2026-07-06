# Spike E1 (T-001) — Are MLS playoffs in `new/USA.csv`, and how are they filtered?

**Date:** 2026-07-05 · **Verdict:** **GO (BL-3)** — playoffs ARE present and ARE cleanly separable by a deterministic per-season date-window rule.

## Findings

1. **Playoff matches are present.** The file (downloaded 2026-07-05; 6,034 rows, seasons 2012–2026)
   has no stage/round column, but every completed season contains 13–37 rows dated after that
   season's regular-season end ("Decision Day"), including every MLS Cup final 2017–2025
   (e.g. 2023-12-09 Columbus Crew vs Los Angeles FC; 2025-12-06 Inter Miami vs Vancouver Whitecaps).
2. **File dates are UTC (or UK-local), not US-local.** US evening kickoffs appear dated **+1 day**
   vs the US-local match date (e.g. the 2024 Decision Day games of Sat 2024-10-19 ET appear as
   2024-10-20; the 2018 MLS Cup final of 2018-12-08 appears as 2018-12-09). A naive
   `date > DecisionDay` filter would therefore misclassify ~7 genuine regular-season matches per
   season as playoffs. This also matters for T-030 ingestion generally: **treat `Date`+`Time` as UTC.**
3. **2020 (COVID) needs one extra window.** The "MLS is Back" tournament's **knockout rounds**
   (which did *not* count toward the regular-season standings) are in the file: 15 matches in
   2020-07-25..2020-08-12. The MIB **group stage** (36 matches, 2020-07-08..2020-07-24) *did* count
   and is retained.

## The filtering rule (R1) — adopted

For season `S` with regular-season end date `DecisionDay(S)` (US-local, public record):

- A row is **regular season** iff `file_date <= DecisionDay(S) + 1 day` — the `+1` absorbs the UTC
  date shift for evening kickoffs.
- **2020 only:** additionally exclude rows in `2020-07-25 .. 2020-08-12` (MIB knockout rounds).
- The current season (2026) has no Decision Day yet; its value must be added to the per-season
  constants when the league publishes it (rule degrades safely: no 2026 rows are excluded until then).

Per-season constants (US-local Decision Day):
2012: 10-28 · 2013: 10-27 · 2014: 10-26 · 2015: 10-25 · 2016: 10-23 · 2017: 10-22 · 2018: 10-28 ·
2019: 10-06 · 2020: 11-08 · 2021: 11-07 · 2022: 10-09 · 2023: 10-21 · 2024: 10-19 · 2025: 10-18

## Verification (real output)

- **Internal consistency:** after applying R1, **every team in every season 2012–2025 except 2020
  has exactly 34 matches** — the known MLS regular-season length. min..max per-team games = 34..34
  for all 13 normal seasons. 2020 = 18..23, consistent with the published shortened season
  (uneven schedules; FC Dallas withdrew from MIB).
- **Known playoff matches excluded:** all 9 MLS Cup finals 2017–2025 map to rows in the file and
  all are excluded by R1 (checked at final date and date+1 to cover the UTC shift).
- **Boundary safety:** the gap between `DecisionDay+1` and the first excluded (playoff) row is
  **≥ 2 days in every season 2012–2025** — the boundary never collides with a playoff row.
- Excluded row counts per season: 2012–2016: 15–17 · 2017: 17 · 2018: 17 · 2019: 13 · 2020: 32
  (17 playoffs + 15 MIB-KO) · 2021: 13 · 2022: 13 · 2023: 28 · 2024: 29 · 2025: 30. The rise from
  2023 reflects the expanded best-of-3 playoff format.

Retained regular-season rows per season after R1:
2017: 374 · 2018: 391 · 2019: 408 · 2020: 292 · 2021: 459 · 2022: 476 · 2023: 493 · 2024: 493 · 2025: 510.

## Residual risk / follow-ups

- **Cross-check vs live-API round labels (2 recent seasons) is pending T-002** (needs the
  API-Football key). The 34-games-per-team invariant is a stronger internal check and already
  passes; the API cross-check remains a cheap confirmation once the key exists.
- Decision Day constants are hand-maintained ground truth (public record); they must live in
  versioned config for the ingestion ticket (T-030/T-031) with the 34-game invariant re-asserted
  as an automated test there.
- If MLS ever schedules a regular-season makeup match ≥2 days after Decision Day (never observed
  2012–2025), R1 would drop it; the per-team-count test would catch this as 33 games for two teams.

## Analysis scripts

Scratch scripts (stdlib-only, re-runnable against `data/raw/USA.csv`): season/date profiling and
R1 verification. Key logic is fully described above; the rule will be implemented for real in the
ingestion package (T-030+) with these checks as pytest assertions.
