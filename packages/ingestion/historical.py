"""T-030: football-data.co.uk loader — fetch `new/USA.csv`, snapshot raw + SHA-256.

Raw snapshots are content-addressed under data/raw/football-data/ (filename embeds the hash),
so re-running is idempotent at both the file layer and the `dataset_snapshot` layer
(`snapshot_hash` is unique; ON CONFLICT DO NOTHING).
"""

from __future__ import annotations

import hashlib
import time
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import psycopg

USA_CSV_URL = "https://www.football-data.co.uk/new/USA.csv"
# Contract §9: 3 retries, exponential backoff 5s/25s/125s.
RETRY_DELAYS_S = (5.0, 25.0, 125.0)


@dataclass(frozen=True)
class RawSnapshot:
    path: Path
    sha256: str
    fetched_at_utc: datetime
    source_url: str


def fetch_usa_csv(
    dest_root: Path,
    url: str = USA_CSV_URL,
    *,
    retry_delays: tuple[float, ...] = RETRY_DELAYS_S,
    _sleep: Callable[[float], object] | None = None,  # injectable for tests
) -> RawSnapshot:
    """Download the file (with retry/backoff) and store it content-addressed. On total
    failure, fall back to the most recent cached snapshot if one exists (Contract fallback)."""
    sleep = _sleep or time.sleep
    body: bytes | None = None
    last_error: Exception | None = None
    for attempt in range(len(retry_delays) + 1):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                body = resp.read()
            break
        except Exception as exc:
            last_error = exc
            if attempt < len(retry_delays):
                sleep(retry_delays[attempt])
    fetched_at = datetime.now(UTC)
    if body is None:
        cached = latest_snapshot(dest_root)
        if cached is not None:
            return cached
        raise RuntimeError(f"USA.csv unreachable and no cached copy exists: {last_error}")

    sha = hashlib.sha256(body).hexdigest()
    day_dir = dest_root / "football-data" / fetched_at.strftime("%Y/%m/%d")
    day_dir.mkdir(parents=True, exist_ok=True)
    path = day_dir / f"USA-{sha[:12]}.csv"
    if not path.exists():  # content-addressed → same content never stored twice per day
        path.write_bytes(body)
    return RawSnapshot(path=path, sha256=sha, fetched_at_utc=fetched_at, source_url=url)


def latest_snapshot(dest_root: Path) -> RawSnapshot | None:
    """Most recent cached USA-*.csv under dest_root, or None."""
    candidates = sorted((dest_root / "football-data").glob("*/*/*/USA-*.csv"))
    if not candidates:
        return None
    path = candidates[-1]
    body = path.read_bytes()
    return RawSnapshot(
        path=path,
        sha256=hashlib.sha256(body).hexdigest(),
        fetched_at_utc=datetime.fromtimestamp(path.stat().st_mtime, tz=UTC),
        source_url="cache",
    )


def record_dataset_snapshot(conn: psycopg.Connection, snap: RawSnapshot, row_count: int) -> int:
    """Insert the `dataset_snapshot` stub; idempotent on snapshot_hash. Returns its id."""
    row = conn.execute(
        "INSERT INTO dataset_snapshot (snapshot_hash, manifest_uri, row_count, created_at_utc)"
        " VALUES (%s, %s, %s, %s) ON CONFLICT (snapshot_hash) DO NOTHING"
        " RETURNING dataset_snapshot_id",
        (snap.sha256, str(snap.path), row_count, snap.fetched_at_utc),
    ).fetchone()
    if row is not None:
        return int(row[0])
    existing = conn.execute(
        "SELECT dataset_snapshot_id FROM dataset_snapshot WHERE snapshot_hash = %s",
        (snap.sha256,),
    ).fetchone()
    assert existing is not None
    return int(existing[0])
