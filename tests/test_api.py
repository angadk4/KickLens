"""T-180 contract tests: endpoints, evidence scoping, pagination, 404s (test DB)."""

import os

import pytest

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")

if DATABASE_URL:
    import psycopg
    from alembic import command
    from alembic.config import Config
    from fastapi.testclient import TestClient

    from apps.api.main import app, db

    @pytest.fixture(scope="module")
    def client():  # type: ignore[no-untyped-def]
        assert DATABASE_URL is not None
        cfg = Config("alembic.ini")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        seed_conn = psycopg.connect(DATABASE_URL, autocommit=True)
        seed_conn.execute("INSERT INTO league (code,name) VALUES ('MLS','MLS')")
        seed_conn.execute(
            "INSERT INTO metrics_snapshot (scope, as_of_utc, payload, created_at_utc)"
            ' VALUES (\'dev\', now(), \'{"n": 3012, "log_loss": 1.0346, "ece": 0.0108}\','
            " now())"
        )
        seed_conn.close()

        def test_db():  # type: ignore[no-untyped-def]
            conn = psycopg.connect(DATABASE_URL)
            try:
                yield conn
            finally:
                conn.close()

        app.dependency_overrides[db] = test_db
        with TestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    def test_health_reports_freshness(client) -> None:  # type: ignore[no-untyped-def]
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["freshness_ok"] is False  # empty DB → honest not-fresh

    def test_leagues(client) -> None:  # type: ignore[no-untyped-def]
        assert client.get("/leagues").json()[0]["code"] == "MLS"

    def test_performance_scope_enforced(client) -> None:  # type: ignore[no-untyped-def]
        assert client.get("/performance", params={"scope": "mixed"}).status_code == 400
        assert client.get("/performance", params={"scope": "live"}).status_code == 404
        dev = client.get("/performance", params={"scope": "dev"})
        assert dev.status_code == 200
        assert dev.json()["scope"] == "dev"
        assert dev.json()["metrics"]["n"] == 3012

    def test_upcoming_and_completed_empty_shapes(client) -> None:  # type: ignore[no-untyped-def]
        assert client.get("/matches/upcoming").json() == []
        assert client.get("/matches/in-play").json() == []  # no games → silent empty list
        completed = client.get("/predictions/completed").json()
        assert completed == {"total_graded": 0, "items": []}

    def test_match_detail_404(client) -> None:  # type: ignore[no-untyped-def]
        assert client.get("/matches/999999").status_code == 404

    def test_methodology_makes_no_superiority_claims(client) -> None:  # type: ignore[no-untyped-def]
        body = client.get("/methodology").json()
        notes = " ".join(body["honesty_notes"]).lower()
        assert "no superiority claim" in notes
        assert "market outperforms the model" in notes

    def test_model_versions_and_calibration_shapes(client) -> None:  # type: ignore[no-untyped-def]
        assert client.get("/model-versions").json() == []
        cal = client.get("/calibration").json()
        assert "dev" in cal and cal["dev"]["ece"] == 0.0108
        assert "test" not in cal  # scope not seeded here — scopes never leak into each other

    # ---------- dashboard-v2 additions: empty-DB behavior ----------

    def test_teams_ratings_empty(client) -> None:  # type: ignore[no-untyped-def]
        res = client.get("/teams/ratings")
        assert res.status_code == 200
        body = res.json()
        assert body["teams"] == [] and body["n_rated_matches"] == 0
        assert body["as_of_utc"] is None and body["season"] is None
        assert res.headers["cache-control"] == "public, max-age=300"

    def test_merkle_roots_empty(client) -> None:  # type: ignore[no-untyped-def]
        body = client.get("/merkle-roots").json()
        assert body["items"] == [] and "algorithm" in body

    def test_verification_404_unknown_match(client) -> None:  # type: ignore[no-untyped-def]
        assert client.get("/matches/999999/verification").status_code == 404

    def test_methodology_enrichment_degrades_null(client) -> None:  # type: ignore[no-untyped-def]
        body = client.get("/methodology").json()
        # no production model in this module → DB-backed keys degrade to null, never crash
        assert body["calibration"]["param_t"] is None
        assert body["dataset"]["snapshot_hash"] is None
        ladder = body["baselines"]["ladder"]
        assert len(ladder) == 8 and body["baselines"]["scope"] == "dev"
        b3 = next(r for r in ladder if r["rung"] == "B3")
        assert b3["log_loss"] == 1.0345
        assert "anchor_repo_html_url" in body

    def test_cache_headers_on_reads_not_health(client) -> None:  # type: ignore[no-untyped-def]
        assert "cache-control" not in client.get("/health").headers
        assert client.get("/leagues").headers["cache-control"] == "public, max-age=3600"
        assert client.get("/matches/upcoming").headers["cache-control"] == "public, max-age=60"
        assert client.get("/matches/in-play").headers["cache-control"] == "public, max-age=60"
