# Contributing

Single-developer project, AI-assisted. These conventions keep the build reproducible and honest.

## Databases (local)

- `kicklens` = the **dev dataset** (loaded history + features). Never point pytest at it.
- `kicklens_test` = throwaway; integration tests migrate/wipe it freely:
  `DATABASE_URL=postgresql://kicklens:kicklens@localhost:5432/kicklens_test uv run pytest`

## Ground rules

- **Python 3.12**, locked with `uv` (`uv.lock` is committed). `ruff` + `mypy --strict` + `pytest`
  must pass before any commit (`make check`).
- **All timestamps are UTC** — storage, logs, cutoffs (ruff's `DTZ` rules enforce timezone-aware
  datetimes).
- **No secrets in the repo.** Config comes from env locally (`.env`, gitignored) and SSM Parameter
  Store in cloud. `gitleaks` runs in pre-commit.
- **One ticket ≈ one commit**, message starts with the ticket id (e.g. `T-010: repo scaffold`).
- A ticket is done only when its acceptance criteria pass, its tests are green, and its doc
  artifact is written.
- **Never weaken or delete a test to make it pass.** The leakage suite, walk-forward harness,
  write-once ledger, hash audit, grading, and evidence-separation tests are load-bearing and
  must never be cut.
- The 2025 season is a **touch-once test set** — no code or analysis may read it before the model
  and calibration are frozen on the 2017–2024 dev era.

## Authoritative specs

The six planning docs in `docs/` (Master Spec, Build Contract, Dependency Verification,
ML Experimental Protocol, Implementation Plan, Pre-Build Review). The Build Contract is the
tie-breaker for implementation questions.
