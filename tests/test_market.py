"""T-110 tests: vig removal sums to one, ordering preserved, subset/parity behavior."""

import os

import pytest
from models.market import devig_proportional


def test_devig_sums_to_one_and_preserves_order() -> None:
    p = devig_proportional(1.80, 3.90, 4.20)
    assert sum(p) == pytest.approx(1.0)
    assert p[0] > p[1] > p[2]


def test_devig_known_values() -> None:
    # fair odds (no vig) recover exactly
    p = devig_proportional(2.0, 4.0, 4.0)
    assert p == pytest.approx((0.5, 0.25, 0.25))
    # proportional scaling: overround removed uniformly
    q = devig_proportional(1.9, 3.8, 3.8)  # same ratios, ~5% vig
    assert q == pytest.approx((0.5, 0.25, 0.25))


DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    import psycopg
    from models.market import PRIMARY_PROVIDER, load_market_probs

    @pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")
    def test_market_subset_parity_with_t004_coverage() -> None:
        assert DATABASE_URL is not None
        with psycopg.connect(DATABASE_URL) as conn:
            probs = load_market_probs(conn, 2017, 2024)
            if not probs:
                pytest.skip("dev historical dataset not loaded in this DB (dev-data test)")
            n = conn.execute(
                "SELECT count(*) FROM match m JOIN season s USING (season_id)"
                " WHERE m.is_regular_season AND m.result IS NOT NULL"
                "   AND s.year BETWEEN 2017 AND 2024"
            ).fetchone()
            assert n is not None
            # T-004: every dev-era RS match has closing odds via pinnacle or the avg fallback
            assert len(probs) == int(n[0])
            primary_share = sum(p.provider == PRIMARY_PROVIDER for p in probs) / len(probs)
            assert primary_share > 0.999  # one known 2020 match uses the fallback
            assert all(sum(p.probs) == pytest.approx(1.0) for p in probs[:200])
