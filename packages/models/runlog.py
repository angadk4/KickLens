"""T-083: append-only experiment-run logging (Protocol §12 schema).

Runs are appended as JSON lines to `experiments/runs.jsonl` (committed — the dev-era
evidence trail). Never rewritten; every run carries snapshot + git SHA + lockfile hash + seed.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import psycopg

PROTOCOL_VERSION = "1.0"
RUNS_PATH = Path("experiments/runs.jsonl")


def code_commit() -> str:
    """The running code's git SHA. In Lambda there is no git binary or .git dir, so the
    image bakes the SHA in at build time via KICKLENS_GIT_SHA (launch-review fix — lineage
    must never silently degrade to 'unknown' in production, T-120)."""
    import os

    env_sha = os.environ.get("KICKLENS_GIT_SHA")
    if env_sha:
        return env_sha
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return "unknown"


def lockfile_hash() -> str:
    lock = Path("uv.lock")
    if not lock.is_file():
        return "unknown"
    return hashlib.sha256(lock.read_bytes()).hexdigest()[:16]


def dataset_version(conn: psycopg.Connection) -> str:
    row = conn.execute(
        "SELECT snapshot_hash, created_at_utc FROM dataset_snapshot"
        " ORDER BY created_at_utc DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return "unknown"
    return f"ds-mls-{row[1]:%Y%m%d}-{str(row[0])[:8]}"


def record_run(
    *,
    conn: psycopg.Connection,
    run_kind: str,
    feature_set: str,
    hyperparameters: dict[str, Any],
    fold_definitions: dict[str, str],
    metrics: dict[str, Any],
    random_seed: int = 42,
    runs_path: Path = RUNS_PATH,
) -> str:
    run_id = str(uuid.uuid4())
    entry = {
        "run_id": run_id,
        "recorded_at_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "run_kind": run_kind,
        "protocol_version": PROTOCOL_VERSION,
        "dataset_version": dataset_version(conn),
        "feature_set_version": feature_set,
        "code_commit": code_commit(),
        "environment": {"lockfile_hash": lockfile_hash()},
        "random_seed": random_seed,
        "hyperparameters": hyperparameters,
        "fold_definitions": fold_definitions,
        "metrics": metrics,
    }
    runs_path.parent.mkdir(parents=True, exist_ok=True)
    with runs_path.open("a", encoding="utf-8") as f:  # append-only
        f.write(json.dumps(entry, sort_keys=True) + "\n")
    return run_id
