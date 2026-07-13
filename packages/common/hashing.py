"""T-131: forecast hashing + public anchor + daily Merkle root (Contract §7).

forecast_hash = SHA-256 of canonical JSON (sorted keys) over the frozen §7 field set.
Anchors append to anchors/YYYY-MM-DD.jsonl at forecast creation (T-3h — before kickoff by
construction); in production the inference job commits+pushes the anchor repo (T-221 wiring),
locally the file write is the anchor and push is a logged no-op. A daily Merkle root of the
day's hashes is committed at 12:00 UTC and stored in `anchor_merkle_root`.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import psycopg


def _anchor_dir() -> Path:
    """Writable anchor dir: KICKLENS_ANCHOR_DIR env (Lambda: /tmp/anchors — /var/task is
    read-only, launch-review fix), else ./anchors locally."""
    import os

    return Path(os.environ.get("KICKLENS_ANCHOR_DIR", "anchors"))


ANCHOR_DIR = Path("anchors")  # retained for tests that monkeypatch it


@dataclass(frozen=True)
class ForecastFields:
    """Exactly the Contract §7 hash field set — do not add or remove fields."""

    match_id: int
    fixture_revision: int
    model_version_id: int
    calibration_artifact_id: int | None
    feature_set_version: str
    p_home: float
    p_draw: float
    p_away: float
    cutoff_utc: str  # ISO-8601 UTC
    forecast_creation_utc: str
    data_freshness_time: str


def canonical_json(fields: ForecastFields) -> str:
    return json.dumps(asdict(fields), sort_keys=True, separators=(",", ":"))


def forecast_hash(fields: ForecastFields) -> str:
    return hashlib.sha256(canonical_json(fields).encode()).hexdigest()


def append_anchor(
    fields: ForecastFields, *, anchor_dir: Path | None = None, now: datetime | None = None
) -> Path:
    """Append {hash, match_id, cutoff} to today's anchor file. Caller must have verified
    creation < kickoff (T-3h construction); the audit suite asserts it independently."""
    if anchor_dir is None:
        import common.hashing as _self  # late module ref: honors test monkeypatching

        anchor_dir = _self.ANCHOR_DIR if Path("anchors") != _self.ANCHOR_DIR else _anchor_dir()
    now = now or datetime.now(UTC)
    anchor_dir.mkdir(parents=True, exist_ok=True)
    path = anchor_dir / f"{now:%Y-%m-%d}.jsonl"
    line = json.dumps(
        {
            "forecast_hash": forecast_hash(fields),
            "match_id": fields.match_id,
            "cutoff_utc": fields.cutoff_utc,
            "anchored_at_utc": now.isoformat(timespec="seconds"),
        },
        sort_keys=True,
    )
    with path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    return path


def push_anchor() -> bool:
    """Production: commit+push the anchor repo (wired in the job container at T-221).
    Locally a no-op — the developer's regular pushes publish the anchor files."""
    return False


def merkle_root(hashes: list[str]) -> str:
    """Deterministic Merkle root (sorted leaves; odd node promoted)."""
    if not hashes:
        return hashlib.sha256(b"empty").hexdigest()
    level = sorted(hashes)
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level) - 1, 2):
            nxt.append(hashlib.sha256((level[i] + level[i + 1]).encode()).hexdigest())
        if len(level) % 2 == 1:
            nxt.append(level[-1])
        level = nxt
    return level[0]


def commit_daily_root_from_content(
    conn: psycopg.Connection, day: date, jsonl_text: str
) -> str | None:
    """Merkle root from anchor-file CONTENT (cloud path: fetched from the public repo —
    the grade Lambda never shares a filesystem with inference; launch-review fix)."""
    hashes = [json.loads(line)["forecast_hash"] for line in jsonl_text.splitlines() if line]
    if not hashes:
        return None
    root = merkle_root(hashes)
    conn.execute(
        "INSERT INTO anchor_merkle_root (day, root, committed_at_utc) VALUES (%s,%s,%s)"
        " ON CONFLICT (day) DO NOTHING",
        (day, root, datetime.now(UTC)),
    )
    return root


def commit_daily_root(
    conn: psycopg.Connection, day: date, *, anchor_dir: Path | None = None
) -> str | None:
    """Compute + store the Merkle root of a day's anchored hashes (idempotent)."""
    if anchor_dir is None:
        import common.hashing as _self

        anchor_dir = _self.ANCHOR_DIR if Path("anchors") != _self.ANCHOR_DIR else _anchor_dir()
    path = anchor_dir / f"{day:%Y-%m-%d}.jsonl"
    if not path.is_file():
        return None
    hashes = [json.loads(line)["forecast_hash"] for line in path.read_text().splitlines() if line]
    root = merkle_root(hashes)
    conn.execute(
        "INSERT INTO anchor_merkle_root (day, root, committed_at_utc) VALUES (%s,%s,%s)"
        " ON CONFLICT (day) DO NOTHING",
        (day, root, datetime.now(UTC)),
    )
    return root
