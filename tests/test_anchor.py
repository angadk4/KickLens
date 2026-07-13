"""T-261 anchor publisher: create/append/idempotent/retry semantics (fake transport)."""

import base64
import json
from datetime import UTC, datetime
from typing import Any

import pytest
from common.anchor import AnchorPushError, anchor_line, publish_anchor
from common.hashing import ForecastFields

FIELDS = ForecastFields(
    match_id=7,
    fixture_revision=0,
    model_version_id=1,
    calibration_artifact_id=None,
    feature_set_version="fs-v1",
    p_home=0.5,
    p_draw=0.3,
    p_away=0.2,
    cutoff_utc="2026-07-16T20:30:00+00:00",
    forecast_creation_utc="2026-07-16T20:31:00+00:00",
    data_freshness_time="2026-07-16T08:00:00+00:00",
)
AT = datetime(2026, 7, 16, 20, 31, tzinfo=UTC)


class FakeGitHub:
    """Minimal Contents-API double: files dict path->content."""

    def __init__(self, fail_times: int = 0) -> None:
        self.files: dict[str, str] = {}
        self.fail_times = fail_times
        self.puts = 0

    def __call__(
        self, url: str, method: str, headers: dict[str, str], body: bytes | None
    ) -> tuple[int, dict[str, Any]]:
        if self.fail_times > 0:
            self.fail_times -= 1
            return 502, {"message": "bad gateway"}
        path = url.split("/contents/")[1]
        if method == "GET":
            if path not in self.files:
                return 404, {"message": "Not Found"}
            content = self.files[path]
            return 200, {
                "content": base64.b64encode(content.encode()).decode(),
                "sha": f"sha-{len(content)}",
            }
        assert method == "PUT" and body is not None
        payload = json.loads(body)
        if path in self.files:
            assert payload.get("sha") == f"sha-{len(self.files[path])}"  # optimistic lock
        self.puts += 1
        self.files[path] = base64.b64decode(payload["content"]).decode()
        return 201, {"content": {"path": path}}


def test_no_token_is_local_noop() -> None:
    assert publish_anchor(FIELDS, token=None, repo=None) is False


def test_creates_file_then_appends_then_idempotent() -> None:
    gh = FakeGitHub()
    assert publish_anchor(FIELDS, token="t", repo="o/r", anchored_at=AT, transport=gh) is True
    path = "anchors/2026-07-16.jsonl"
    assert gh.files[path] == anchor_line(FIELDS, AT) + "\n"

    from dataclasses import replace

    second = replace(FIELDS, match_id=8, p_home=0.4, p_draw=0.35, p_away=0.25)
    publish_anchor(second, token="t", repo="o/r", anchored_at=AT, transport=gh)
    assert len(gh.files[path].splitlines()) == 2

    puts_before = gh.puts
    publish_anchor(FIELDS, token="t", repo="o/r", anchored_at=AT, transport=gh)  # same line
    assert gh.puts == puts_before  # already-anchored -> no duplicate commit


def test_retries_then_raises_anchor_push_error() -> None:
    gh = FakeGitHub(fail_times=99)
    delays: list[float] = []
    with pytest.raises(AnchorPushError, match="after retries"):
        publish_anchor(
            FIELDS, token="t", repo="o/r", anchored_at=AT, transport=gh, sleep=delays.append
        )
    # launch-review fix: ladder shortened to fit the 120s inference Lambda timeout
    assert delays == [2.0, 5.0]


def test_transient_failure_recovers() -> None:
    gh = FakeGitHub(fail_times=2)  # fails GET twice, then works end-to-end
    ok = publish_anchor(
        FIELDS, token="t", repo="o/r", anchored_at=AT, transport=gh, sleep=lambda _s: None
    )
    assert ok is True and len(gh.files) == 1
