"""T-121: model registry — artifacts on storage + metadata in Postgres.

Locally artifacts live under data/artifacts/ (gitignored) with file:// URIs; production swaps
the store for S3 (M8) without touching the metadata contract. Exactly one production
model_version per league is enforced by the DB partial unique index (0002).
"""

from __future__ import annotations

import hashlib
import pickle
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import psycopg

DEFAULT_ARTIFACT_ROOT = Path("data/artifacts")


def _store(obj: Any, root: Path | str, kind: str) -> tuple[str, str]:
    """Pickle obj content-addressed; returns (uri, sha256). Root may be a local dir or an
    s3://bucket[/prefix] URI (production: Contract §8 = S3 artifacts + Postgres metadata)."""
    blob = pickle.dumps(obj)
    sha = hashlib.sha256(blob).hexdigest()
    if isinstance(root, str) and root.startswith("s3://"):
        import boto3  # type: ignore[import-untyped]  # lazy: cloud/dev-with-creds only

        bucket_and_prefix = root.removeprefix("s3://").rstrip("/")
        bucket, _, prefix = bucket_and_prefix.partition("/")
        key = f"{prefix + '/' if prefix else ''}{kind}/{sha[:16]}.pkl"
        boto3.client("s3").put_object(Bucket=bucket, Key=key, Body=blob)
        return f"s3://{bucket}/{key}", sha
    path = Path(root) / kind / f"{sha[:16]}.pkl"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(blob)
    return path.resolve().as_uri(), sha


def load_artifact(uri: str) -> Any:
    if uri.startswith("s3://"):
        import boto3

        bucket, _, key = uri.removeprefix("s3://").partition("/")
        body = boto3.client("s3").get_object(Bucket=bucket, Key=key)["Body"].read()
        return pickle.loads(body)
    path = Path(uri.removeprefix("file:///").removeprefix("file://"))
    return pickle.loads(path.read_bytes())


def create_training_run(
    conn: psycopg.Connection,
    *,
    dataset_snapshot_id: int,
    code_git_sha: str,
    seed: int,
    lockfile_hash: str,
    params: str | None = None,
) -> int:
    row = conn.execute(
        "INSERT INTO training_run (dataset_snapshot_id, code_git_sha, seed, lockfile_hash,"
        " params, status, started_at_utc) VALUES (%s,%s,%s,%s,%s,'running',%s)"
        " RETURNING training_run_id",
        (dataset_snapshot_id, code_git_sha, seed, lockfile_hash, params, datetime.now(UTC)),
    ).fetchone()
    assert row is not None
    return int(row[0])


def save_model_artifact(
    conn: psycopg.Connection,
    training_run_id: int,
    model: Any,
    *,
    root: Path | str = DEFAULT_ARTIFACT_ROOT,
) -> int:
    uri, sha = _store(model, root, "model")
    row = conn.execute(
        "INSERT INTO model_artifact (training_run_id, artifact_uri, artifact_hash,"
        " created_at_utc) VALUES (%s,%s,%s,%s) RETURNING model_artifact_id",
        (training_run_id, uri, sha, datetime.now(UTC)),
    ).fetchone()
    assert row is not None
    return int(row[0])


def save_calibration_artifact(
    conn: psycopg.Connection,
    training_run_id: int,
    calibrator: Any,
    *,
    method: str = "temperature",
    param_t: float | None = None,
    root: Path | str = DEFAULT_ARTIFACT_ROOT,
) -> int:
    uri, _sha = _store(calibrator, root, "calibration")
    row = conn.execute(
        "INSERT INTO calibration_artifact (training_run_id, method, param_t, artifact_uri,"
        " created_at_utc) VALUES (%s,%s,%s,%s,%s) RETURNING calibration_artifact_id",
        (training_run_id, method, param_t, uri, datetime.now(UTC)),
    ).fetchone()
    assert row is not None
    return int(row[0])


def register_model_version(
    conn: psycopg.Connection,
    *,
    league_id: int,
    model_artifact_id: int,
    calibration_artifact_id: int | None,
    version_label: str,
) -> int:
    row = conn.execute(
        "INSERT INTO model_version (league_id, model_artifact_id, calibration_artifact_id,"
        " version_label, is_production, created_at_utc) VALUES (%s,%s,%s,%s,false,%s)"
        " RETURNING model_version_id",
        (league_id, model_artifact_id, calibration_artifact_id, version_label, datetime.now(UTC)),
    ).fetchone()
    assert row is not None
    return int(row[0])


def promote(conn: psycopg.Connection, model_version_id: int) -> None:
    """Repoint is_production (also the frozen rollback mechanism, Contract §6.6)."""
    row = conn.execute(
        "SELECT league_id FROM model_version WHERE model_version_id = %s", (model_version_id,)
    ).fetchone()
    if row is None:
        raise ValueError(f"unknown model_version {model_version_id}")
    with conn.transaction():
        conn.execute(
            "UPDATE model_version SET is_production = false WHERE league_id = %s AND is_production",
            (int(row[0]),),
        )
        conn.execute(
            "UPDATE model_version SET is_production = true, promoted_at_utc = %s"
            " WHERE model_version_id = %s",
            (datetime.now(UTC), model_version_id),
        )


def get_production_version(
    conn: psycopg.Connection, league_id: int
) -> tuple[int, str, str | None] | None:
    """(model_version_id, model_uri, calibration_uri) of the production model, or None."""
    row = conn.execute(
        "SELECT mv.model_version_id, ma.artifact_uri, ca.artifact_uri"
        " FROM model_version mv JOIN model_artifact ma USING (model_artifact_id)"
        " LEFT JOIN calibration_artifact ca USING (calibration_artifact_id)"
        " WHERE mv.league_id = %s AND mv.is_production",
        (league_id,),
    ).fetchone()
    if row is None:
        return None
    return int(row[0]), str(row[1]), None if row[2] is None else str(row[2])
