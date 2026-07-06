# Historical data pipeline (M1: T-030/T-031/T-032/T-040/T-041/T-050/T-051)

Code: `packages/ingestion/`. Run: `uv run python -m ingestion.load` (needs `DATABASE_URL`).
Everything below was verified against the real file + local DB on 2026-07-06 (see BUILD_LOG).

## T-030 — Source + snapshotting (data-source note)

- Source: `https://www.football-data.co.uk/new/USA.csv` (MLS 2012→current; closing odds only).
- Fetch: 3 retries, backoff 5s/25s/125s (Contract §9); on total failure falls back to the most
  recent cached snapshot; unreachable + no cache → hard error.
- Every fetch stored content-addressed: `data/raw/football-data/YYYY/MM/DD/USA-<sha12>.csv`;
  the SHA-256 recorded in `dataset_snapshot` (unique on hash → idempotent re-runs).

## T-031 — Normalization mapping

| CSV | Canonical | Rule |
|---|---|---|
| `Date`,`Time` | `match.kickoff_utc` | **parsed as Europe/London** (proven UK-local by spike E2), converted to UTC, `kickoff_approx=true` |
| `Date` | `match.natural_key_date` | file-local date kept verbatim — identity, not kickoff |
| `Home`,`Away` | `home/away_team_id` | via `team_alias` (provider `football-data`); unresolved name → hard stop |
| `HG`,`AG`,`Res` | goals + `result` | Res must be consistent with the score (gate) |
| `PSC*` / `AvgC*` / `MaxC*` | `market_snapshot` providers `pinnacle` / `market-avg` / `market-max` | `is_closing=true`, `capture_time_utc = kickoff_utc` (deterministic → idempotent) |

- Missing required columns → `ColumnDriftError` (halt; never silently coerce).
- A malformed row → parse-reject (quarantined with line number); one bad row never sinks the batch.
- A corrupt/implausible **odds group** → stripped and logged as an odds-issue; the match row
  survives (Contract §5 missing-odds policy). Real cases in the current file: `AvgCH='x'`
  (line 5382), market-avg overrounds 0.953 (line 151) and 1.471 (line 3242).

## T-032 — Regular-season filter (exclusion rule)

R1 from spike E1 (`docs/spikes/E1-playoffs.md`): regular season iff
`file_date <= DecisionDay(season)+1d`, minus the 2020 MIB-knockout window. Constants versioned in
`packages/ingestion/resources/decision_days.json` (2026 to be added when published). Excluded
matches are **tagged** `is_regular_season=false`, not dropped.

## T-040 — Team-alias map (alias README)

Seeded from `packages/ingestion/resources/team_aliases_draft.json` (spike T-005): 31 canonical
teams (incl. defunct **Chivas USA**, pre-era only), aliases for `football-data`, `api-football`
(29 ids), `highlightly` (22 ids so far). San Diego FC + Highlightly stragglers resolve as match
payloads arrive. Unresolved name at load time = hard stop (`UnresolvedTeamError`).

## T-041 — Source-of-truth + reconciliation

Prior complete seasons: **football-data.co.uk wins** on results/odds; current season: the live
provider wins (applies from T-140+). A re-ingest that disagrees with a stored result logs a
`Conflict` (kept forever in the report output), applies the winning value, and bumps
`match.result_version` — grades recompute downstream, forecasts never change.

## T-050 — Validation gates + quarantine (validation rules)

Row-level (reject → `staging_rejects` with reason + line): negative goals; result inconsistent
with score; home==away; implausible season; date outside season-year; duplicate natural key
in batch. Odds-level (strip group, keep row): any price ≤ 1; overround outside (1.0, 1.25] for
coherent sources (`pinnacle`, `market-avg`; `market-max` is a cross-book best-price composite —
its implied sum legitimately dips below 1 and is exempt). Batch reject rate > 5% →
`RejectRateExceeded` (halt + alarm).

## T-051 — Data-quality checklist (`ingestion/dq.py`)

Hard failures: duplicate natural keys · teams without a football-data alias · NULL kickoffs ·
final matches without results. Review flags: in-season gaps > 21 days (currently: 2020 COVID
122d; 2023/2024 Leagues-Cup 36/34d — all real league breaks). Also reports per-season era RS
counts (must equal spike E6) and Pinnacle closing coverage.

## Verified state (2026-07-06 production load)

6,034 rows → 6,034 valid, 0 rejects, 3 odds-issues; 17,865 closing snapshots; era RS counts
exactly match E6 (374/391/408/292/459/476/493/493/510); Pinnacle era coverage 3,895/3,896;
DQ violations: none. Full suite: 63 passed (with DB), gates green.
