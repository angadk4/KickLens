# KickLens dev targets. Requires uv (https://docs.astral.sh/uv/) and Python 3.12.
# On Windows without make, run the underlying commands directly.

.PHONY: install lint type test check up down migrate

up:
	docker compose up --build -d postgres
	docker compose up --build app

down:
	docker compose down

# Functional from T-020 (Alembic migrations); placeholder until then.
migrate:
	docker compose run --rm app alembic upgrade head

install:
	uv sync

lint:
	uv run ruff check .
	uv run ruff format --check .

type:
	uv run mypy

test:
	uv run pytest

check: lint type test
