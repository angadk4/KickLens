# KickLens

A methodologically honest **MLS regular-season 1X2 (home/draw/away) forecaster** with a public,
tamper-evident track record.

> **Status: pre-launch.** The full local system is built and tested; cloud deployment (M8) and
> the live launch remain. No performance claim is made beyond what `docs/` records with CIs.

## What exists today (all tested; 155+ tests green)

- **Data pipeline:** football-data.co.uk history (6,034 matches) with SHA-256 snapshots,
  validation gates + quarantine, verified playoff filter, curated team-alias map, DQ suite.
  Live adapters for Highlightly (fixtures) and SportsGameOdds (3-way odds near cutoff).
- **Leakage-safe features (fs-v1):** point-in-time Elo/form/rest/schedule engine with the
  never-cut R1–R8 leakage suite (bit-for-bit recompute parity over every stored row).
- **A sealed, pre-registered model:** multinomial logistic on Elo diff + neutral site with
  temperature calibration — selected via a 20-config ablation over a 210-fold expanding
  walk-forward and frozen (`packages/models/champion.py`) before the touch-once 2025 test.
  Honest headline: it is statistically **equivalent to a plain Elo baseline** and ~0.02 nats
  **behind the closing market** on dev data (see `docs/model-card.md`).
- **The tamper-evident forecast loop:** write-once official forecasts at kickoff−3h, SHA-256
  hashes anchored to public git files, daily Merkle roots, postponement supersession,
  automated grading/regrading, and metrics that never merge dev/test/backtest/live evidence.
- **A read-only FastAPI + React/Recharts dashboard** (`apps/api`, `apps/web`).

## Key documents

`docs/model-card.md` · `docs/data-card.md` · `docs/selection.md` (sealed) ·
`docs/baselines.md` · `docs/leakage-tests.md` · `docs/pre-final-test-checklist.md` ·
`docs/data-pipeline.md` · spikes under `docs/spikes/`

## Repo layout

```
apps/                      # FastAPI app, frontend (later milestones)
packages/
  ingestion/               # provider clients, normalization
  features/                # fs-v1 point-in-time feature engine
  models/                  # baselines, logistic champion, calibration
  common/                  # config, db, hashing, shared types
jobs/                      # job handlers (ingest/feature/inference/grade)
infra/                     # Terraform
tests/                     # unit + integration + leakage suite
docs/                      # spikes, schema, ADRs, model card, data card
```

## Local development

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```sh
uv sync              # create .venv + install dev deps (uv.lock is the lockfile)
uv run pytest        # tests
uv run ruff check .  # lint
uv run mypy          # types
pre-commit install   # hooks (incl. gitleaks secret scan)
```

Or `make install / lint / type / test / check`.

### Local stack (Docker Compose)

```sh
cp .env.example .env   # local defaults; fill provider keys as they arrive
make up                # Postgres 16 (volume + healthcheck) + app container (imports packages)
make down              # stop the stack
make migrate           # alembic upgrade head (functional from T-020)
```

With the stack up, the DB smoke test runs: `DATABASE_URL=postgresql://kicklens:kicklens@localhost:5432/kicklens uv run pytest tests/test_db_smoke.py`.

## License / data

Historical data: football-data.co.uk (`new/USA.csv`), downloaded locally to `data/raw/`
(not committed). Live providers TBD pending spike results (`docs/spikes/`).
