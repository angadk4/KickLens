"""T-261: publish forecast-hash anchors to the public GitHub repo (Contract §7).

Each official forecast's anchor line is appended to `anchors/YYYY-MM-DD.jsonl` in the public
repo (developer decision: this repo, angadk4/KickLens) via the GitHub Contents API — no git
binary needed inside Lambda. Concurrency is already serialized by the per-league advisory lock
around finalization.

Frozen fail-stop (T-131): push failure -> retry (5s/25s/125s) -> the forecast is STILL recorded
locally/DB; the failure is surfaced loudly (caller appends an AnchorPushFailed event). The
anchor can then be re-pushed by the next successful publish or manually.

No token configured -> no-op returning False (local/dev mode: the file write IS the anchor).
"""

from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from common.hashing import ForecastFields, forecast_hash

# Launch-review fix: the 5/25/125 provider ladder cannot fit the 120s inference Lambda
# timeout (155s sleeps + 4x30s HTTP). Anchor pushes use a short in-process ladder; eventual
# publication is guaranteed by the per-run catch-up (models.inference.retry_failed_anchors).
RETRY_DELAYS_S = (2.0, 5.0)
HTTP_TIMEOUT_S = 10
_API = "https://api.github.com"
_UA = "kicklens-anchor-bot"

Transport = Callable[[str, str, dict[str, str], bytes | None], tuple[int, dict[str, Any]]]


def _http(
    url: str, method: str, headers: dict[str, str], body: bytes | None
) -> tuple[int, dict[str, Any]]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


def anchor_line(fields: ForecastFields, anchored_at: datetime) -> str:
    return json.dumps(
        {
            "forecast_hash": forecast_hash(fields),
            "match_id": fields.match_id,
            "cutoff_utc": fields.cutoff_utc,
            "anchored_at_utc": anchored_at.isoformat(timespec="seconds"),
        },
        sort_keys=True,
    )


def publish_anchor(
    fields: ForecastFields,
    *,
    token: str | None,
    repo: str | None,
    anchored_at: datetime | None = None,
    transport: Transport = _http,
    sleep: Callable[[float], object] = time.sleep,
) -> bool:
    """Append the anchor line to today's file in the public repo. True = pushed;
    False = not configured (local mode). Raises AnchorPushError after exhausted retries."""
    if not token or not repo:
        return False
    anchored_at = anchored_at or datetime.now(UTC)
    path = f"anchors/{anchored_at:%Y-%m-%d}.jsonl"
    line = anchor_line(fields, anchored_at)
    last: str = ""
    for attempt in range(len(RETRY_DELAYS_S) + 1):
        try:
            _append_via_contents_api(path, line, token=token, repo=repo, transport=transport)
            return True
        except Exception as exc:
            last = f"{type(exc).__name__}: {exc}"
            if attempt < len(RETRY_DELAYS_S):
                sleep(RETRY_DELAYS_S[attempt])
    raise AnchorPushError(f"anchor push failed after retries: {last}")


class AnchorPushError(RuntimeError):
    """Push exhausted its retries — forecast remains recorded; caller logs the event."""


def _append_via_contents_api(
    path: str, line: str, *, token: str, repo: str, transport: Transport
) -> None:
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": _UA,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    }
    url = f"{_API}/repos/{repo}/contents/{path}"
    status, body = transport(url, "GET", headers, None)
    if status == 200:
        existing = base64.b64decode(body["content"]).decode()
        sha: str | None = body["sha"]
    elif status == 404:
        existing, sha = "", None
    else:
        raise RuntimeError(f"GET {path} -> {status}: {body.get('message')}")

    if line in existing.splitlines():
        return  # idempotent: this exact anchor is already public
    new_content = existing + line + "\n"
    payload: dict[str, Any] = {
        "message": f"anchor: {path.rsplit('/', 1)[-1]} += 1 forecast hash",
        "content": base64.b64encode(new_content.encode()).decode(),
    }
    if sha is not None:
        payload["sha"] = sha
    status, body = transport(url, "PUT", headers, json.dumps(payload).encode())
    if status not in (200, 201):
        raise RuntimeError(f"PUT {path} -> {status}: {body.get('message')}")
