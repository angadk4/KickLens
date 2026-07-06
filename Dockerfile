# KickLens app/job container. Python 3.12 + uv; used by Docker Compose locally.
# (The production Lambda images are built separately in infra/ at M8.)
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependency layer (cache-friendly): lockfile only, no project code.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Project code (README needed by the hatchling metadata build).
COPY README.md ./
COPY packages packages
COPY jobs jobs
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

CMD ["python", "-c", "import common, ingestion, features, models; print('kicklens packages OK')"]
