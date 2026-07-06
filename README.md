# KickLens

A methodologically honest **MLS regular-season 1X2 (home/draw/away) forecaster** with a public,
tamper-evident track record.

> **Status: pre-MVP, under construction.** Nothing described below as planned exists yet unless
> explicitly marked as built. No performance claims are made until the evidence exists.

## What it will do (planned)

- Train a multinomial logistic model (LightGBM as challenger experiment only) on historical MLS
  regular-season data (2017–2024 dev era), calibrated with temperature scaling.
- Validate with expanding walk-forward and a **touch-once** 2025 test season.
- Freeze each official forecast at **kickoff − 3h** with a SHA-256 hash anchored in a public git repo.
- Grade automatically against results and serve a read-only dashboard that keeps
  dev / test / backtest / live evidence strictly separated.

## What exists today

- M0 data spikes: playoff-filter rule, historical odds coverage, sample-size analysis
  (see `docs/spikes/`).
- This repo scaffold: monorepo layout, tooling (`uv`, `ruff`, `mypy`, `pytest`, `pre-commit`).

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
