"""Dashboard v5 snapshot enrichment: dev payload carries the sealed champion CI +
secondary metrics; live payload carries ECE + classwise keys once grades exist."""

import os

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import psycopg
    from models.aggregation import latest_snapshot, publish_dev_snapshot


def test_dev_snapshot_carries_ci_and_secondary_metrics() -> None:
    assert DATABASE_URL is not None
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        publish_dev_snapshot(conn)
        payload = latest_snapshot(conn, "dev")
        assert payload is not None
        # sealed core numbers unchanged
        assert payload["n"] == 3012
        assert payload["log_loss"] == 1.0346
        assert payload["ece"] == 0.0108
        # additive keys from the model card
        assert payload["log_loss_ci95"] == [1.018, 1.051]
        assert payload["rps"] == 0.2168
        assert payload["accuracy"] == 0.493
