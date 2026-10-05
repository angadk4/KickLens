# Incident: live matches duplicated by the monthly historical load

**Window:** 2026-08-01 11:13 UTC to 2026-10-05 00:18 UTC · **Status:** resolved ·
**Published forecasts:** unchanged, and they stay unchanged

## Summary

For two months, every match the live pipeline recorded was inserted into the database a
second time by the monthly retraining workflow. The model's inputs counted each live-season
result twice. **150 of the 186 official forecasts made so far were frozen on those inputs.**
Replaying all 186 shows the duplication moved the published probabilities by about 2
percentage points on average but did not measurably change their quality: log loss
+0.0012 nats, 95% CI [−0.0101, +0.0122]. The anchored record is intact and was not edited.

## What happened

`.github/workflows/train.yml` runs on the 1st of each month against the production database.
Its first step, `python -m ingestion.load`, loads football-data.co.uk's `new/USA.csv`, which
carries the **current** season as well as past ones.

The loader recognised an existing match only through the partial unique index on
`natural_key_date` (`ON CONFLICT ... WHERE natural_key_date IS NOT NULL`). The live ingest
(`ingestion/live.py`) creates current-season rows from provider fixtures and never sets
`natural_key_date`. Live rows were therefore invisible to the loader, which inserted a
second row for every live match it found in the file:

| Load | Duplicates created |
|---|---|
| 2026-08-01 11:13 UTC | 35 (late-July matches) |
| 2026-09-01 14:28 UTC | 76 (August) |
| 2026-10-01 16:50 UTC | 74 (September) |

Each duplicate was a complete regular-season row with a result. The feature builder
(`features/builder.py`) and inference history (`models/inference.py`) both select every
regular-season match with a result, so from 2026-08-01 every forecast counted each live match
twice in `elo_diff`, the five- and ten-match form features, congestion and season progress.
The public Ratings page, which replays the same Elo engine, showed doubled histories.

## How it was found

The daily canary raised once, on 2026-10-02: *"1 match(es) kicked off in the last 48h with NO
official forecast."* The match was the duplicate of New York Red Bulls v St. Louis City
(2026-09-30). Earlier duplicates never tripped that check, because none landed inside its
48-hour window, and this one stopped tripping it the next day by ageing out, not by being
fixed. Tracing the alarm led to Ratings histories with two entries per match date for all 30
teams since 2026-07-16.

That the bug ran for two months is a monitoring gap. Nothing checked for duplication
directly; the canary does now (below).

## Effect on the forecasts, measured

Every official forecast was replayed with the production model and calibrator, once with the
duplicates that existed at its freeze time and once with none. The first replay reproduced
**all 186 published forecasts to within 1.1e-16**, so the figures below are measurements of
what happened, not estimates.

| | 150 affected forecasts |
|---|---|
| `elo_diff` input | off by 19.0 Elo points on average, at most 70.9 (home advantage is 60) |
| Published probabilities | moved on average by 2.09 pp (home), 0.30 pp (draw), 1.82 pp (away); at most 7.94 pp |
| Top pick | would have differed on 9 of 150 |
| Log loss, as published vs clean | 1.0976 vs 1.0965: **+0.0012 nats, 95% CI [−0.0101, +0.0122]** |
| Whole live record (n=186) | 1.0763 published vs 1.0754 clean |

The 36 forecasts frozen before 2026-08-01 were unaffected, and their clean and published
values are identical.

The September decline in live log loss is **not** explained by this bug: the clean replay
scores the same months almost identically. It reflects the season itself: the 2026 season through late
September produced 41.8% home wins and 30.6% draws, far closer to uniform than any
prior season.

## What was not affected

- **The anchored record.** Every forecast is exactly what was computed, hashed and committed
  to GitHub before kickoff. Verification passes. Nothing was re-issued or edited, and nothing
  will be: the published record is the record, footnoted by this document.
- **Grading.** Grades are computed on the live rows. No duplicate carried a forecast, a
  grade, an event or a draft.
- **The sealed dev and 2025 test evidence.** Both predate the live season.
- **The production model.** It is still the 2026-07-12 version. The three monthly challengers
  (training runs 2, 3 and 4) were trained on data that included the duplicates. None was
  promoted, and none should be.

## Repair (2026-10-05 00:18 UTC)

1. **Backup** of every row removed: 185 `match`, 185 `feature_row` and 370 `market_snapshot`
   rows (football-data closing averages and maxima). It is stored privately at
   `s3://kicklens-025042200085-artifacts/backups/incidents/2026-10-duplicate-live-matches/twins-backup-2026-10.json`
   (sha256 `af6fc32bbea372dcbd55bc4652883f6a95f336b771f0b55943c4677f3f664189`).
2. **One transaction**, dry-run first, that aborted on any surprise. It re-identified the
   duplicates and required them to equal the backup exactly, and required zero references
   from the record tables. It confirmed all 185 file scores equal the live scores, deleted
   with exact expected counts, and required zero duplicate pairs afterwards.
3. **Verified from outside:** Ratings now replays 5,949 matches (was 6,134) with one entry
   per match. The public record still shows 186 graded and log loss 1.0763. Verification still
   passes on the affected match, the canary is green, and the new duplicate check reads 0.

## Prevention

- `ingestion/load.py` now looks up a live-owned row by the same rule `live.py` uses (same
  pair, kickoff within ±30h) and leaves it alone. The current season's result belongs to the
  live provider (Contract §5), so a disagreement is logged and never applied. A duplicate
  is never inserted, and no closing odds are attached.
- `tests/test_live_historical_identity.py` pins this. Four of its five tests fail against
  the old loader; the fifth guards the opposite failure (merging a genuinely separate meeting).
- The canary now raises on any two regular-season rows for the same pair within ±30h. Run
  against production before the repair, it counted exactly the 185 duplicates across all 15
  seasons, with no false positives.

## Open follow-ups

- **Challenger lineage.** Dataset snapshots 4, 6 and 8 counted the duplicates. With those
  rows removed, the snapshots cannot be rebuilt from the database alone; the backup above
  restores them if ever needed.
- **`training_run` bookkeeping.** All four runs show `running` with no finish time. The
  workflow succeeds; `train_production.py` never marks the run finished.
- **Found during this investigation, unrelated to the duplicates.** For 6 of 186 official
  forecasts, the stored `feature_row` differs from the features the forecast used, by at most
  2.3e-5 in `season_progress` alone. An earlier computation for the same match and cutoff
  wrote the row first, and inference's upsert keeps the first write. It is negligible in
  effect but worth closing, so that stored inputs always equal used inputs.
