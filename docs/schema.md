# KickLens database schema

Migrations: Alembic (`migrations/`), applied via `make migrate` (or `uv run alembic upgrade head`).
All timestamps are **timestamptz (UTC)**. Surrogate integer PKs everywhere.

## Identity rules (Contract §5 — the V1 bug killers)

- **Live rows:** identity = `source_fixture (provider, provider_fixture_id, fixture_revision)`
  (unique). Every provider change (kickoff move, status change) inserts a **new revision**; the
  revisions of one provider fixture all point at the **same** `match_id` — a postponement never
  creates a duplicate match.
- **Historical rows:** natural key `(season_id, natural_key_date, home_team_id, away_team_id)` —
  partial unique index where `natural_key_date IS NOT NULL`.
- **Kickoff timestamp is never part of any key.** `match.kickoff_utc` is data, not identity
  (`kickoff_approx=true` for historical file rows, whose Date+Time is UTC-shifted — see
  `docs/spikes/E1-playoffs.md`).

## Core tables (migration `0001_core_schema`, T-020)

| Table | Purpose | Key constraints |
|---|---|---|
| `league` | leagues (MLS) | `code` unique |
| `season` | league-year + `regular_season_end` (Decision Day, drives the R1 playoff filter) | unique `(league_id, year)` |
| `team` | canonical teams (`is_defunct` for e.g. Chivas USA) | `canonical_name` unique |
| `team_alias` | provider name/id → `team_id` | unique `(provider, provider_key)` |
| `match` | canonical matches; result append-only via `result_version` | natural-key partial unique; `result IN ('H','D','A')`; home≠away; idx on kickoff, (season,status) |
| `source_fixture` | raw live-API fixture revisions (+ `raw_ref` to the S3/local snapshot) | unique `(provider, provider_fixture_id, fixture_revision)` |
| `elo_rating` | point-in-time rating **after** each match (NULL match = baseline row) | unique `(team_id, match_id)`; idx `(team_id, rating_date)` |
| `feature_row` | fs-v1 point-in-time features as of the T-3h cutoff (JSONB + `inputs_hash`) | unique `(match_id, feature_set_version, as_of_utc)` |
| `market_snapshot` | odds snapshots (live captures and historical closing via `is_closing`) | unique `(match_id, provider, capture_time_utc)`; odds > 1 check |

## Audit / ops tables (migration `0002_audit_ops`, T-021)

The frozen lineage chain (Contract §7 + §12): raw snapshot → `dataset_snapshot` →
`training_run` → `model_artifact` / `calibration_artifact` → `model_version` →
`prediction_run` → `prediction` → `prediction_event` / `prediction_grade` → `metrics_snapshot`.

| Table | Purpose | Key constraints |
|---|---|---|
| `dataset_snapshot` | hashed dataset manifests | `snapshot_hash` unique |
| `training_run` | git SHA + seed + lockfile hash + params per training | FK snapshot |
| `model_artifact` / `calibration_artifact` | S3 artifact pointers (+hash; temperature `param_t`, fold provenance) | FK training_run |
| `model_version` | registry binding; `is_production` flag | **partial unique: one production version per league**; unique (league, label) |
| `prediction_run` | full per-forecast lineage: cutoff, feature_row, fs-version, freshness, model_version, git SHA, seed, lockfile hash, optional market_snapshot, `inputs_hash`, `stale_inputs` | FKs across the chain |
| `prediction` | **write-once** official forecast: probs, cutoff, creation time, `fixture_revision`, `forecast_hash` (unique), `anchored_at_utc` | probs > 0 and sum≈1 CHECK; **UPDATE/DELETE rejected by trigger** |
| `prediction_event` | append-only state ledger (Finalized/Frozen/Voided/…) | **UPDATE/DELETE rejected by trigger** |
| `prediction_grade` | log loss / RPS / Brier / correct per result_version; regrades append | unique (prediction, result_version) |
| `metrics_snapshot` | published metrics, **evidence-separated** | `scope IN ('dev','test','backtest','live')` CHECK |
| `job_run` | choreography bookkeeping | `idempotency_key` unique |
| `draft_prediction` | overwritable preliminary forecasts (never graded/hashed) | unique match_id |
| `staging_rejects` | quarantined bad input rows (reason + raw_ref + batch) | — |
| `anchor_merkle_root` | daily Merkle root of the day's forecast hashes (12:00 UTC) | `day` unique |

Write-once enforcement is layered: DB triggers (`kicklens_forbid_mutation`) here, plus the T-022
application guard; production adds a DB role without UPDATE/DELETE grants on these tables.

## Testing

`tests/test_schema_core.py` (integration; needs `DATABASE_URL` + `make up`):
migration up→down→up clean; duplicate `source_fixture` rejected; postponement (revision bump)
keeps one match identity; historical natural-key duplicate rejected; `market_snapshot`
capture-time uniqueness + odds check; result check constraint.
