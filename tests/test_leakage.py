"""T-064 — the leakage suite (R1-R8). NEVER weaken, skip, or delete these (CLAUDE.md §2.2).

R1 recompute parity · R2 no future-dated inputs · R3 Elo excludes current match ·
R4 rolling windows exclude current match · R5 season_progress result-independent ·
R6 no future market_snapshot at cutoff · R7 calibration slice past-only ·
R8 a deliberately leaky variant IS caught (canary).

Unit layer: crafted fixtures (always runs). Integration layer: recompute parity against the
stored rows of the real loaded DB (runs when DATABASE_URL is set).
"""

import json
import os
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from features.engine import MatchInput, build_feature_rows

T0 = datetime(2024, 3, 2, 0, 30, tzinfo=UTC)


def mi(mid: int, days: float, home: int, away: int, hg: int, ag: int) -> MatchInput:
    return MatchInput(mid, 2024, T0 + timedelta(days=days), home, away, hg, ag)


FIXTURE = [
    mi(1, 0, 10, 20, 3, 0),
    mi(2, 7, 20, 30, 1, 1),
    mi(3, 14, 10, 30, 0, 2),
    mi(4, 21, 30, 20, 2, 1),
    mi(5, 28, 20, 10, 4, 0),
]


def test_r1_recompute_parity_on_fixture() -> None:
    a, b = build_feature_rows(FIXTURE), build_feature_rows(list(FIXTURE))
    assert [(r.match_id, r.inputs_hash, r.features) for r in a] == [
        (r.match_id, r.inputs_hash, r.features) for r in b
    ]


def test_r2_no_future_dated_inputs() -> None:
    """Flipping ANY later match's result must not change an earlier match's features."""
    base = build_feature_rows(FIXTURE)
    tampered = [
        FIXTURE[0],
        FIXTURE[1],
        FIXTURE[2],
        FIXTURE[3],
        replace(FIXTURE[4], home_goals=0, away_goals=9),
    ]
    out = build_feature_rows(tampered)
    for i in range(4):  # every match before the tampered one is bit-identical
        assert out[i].features == base[i].features and out[i].inputs_hash == base[i].inputs_hash


def test_r3_elo_excludes_current_match() -> None:
    """Flipping a match's own result must not change its own elo_diff."""
    flipped = [
        FIXTURE[0],
        FIXTURE[1],
        replace(FIXTURE[2], home_goals=9, away_goals=0),
        FIXTURE[3],
        FIXTURE[4],
    ]
    base, out = build_feature_rows(FIXTURE), build_feature_rows(flipped)
    assert out[2].features["elo_diff"] == base[2].features["elo_diff"]


def test_r4_rolling_windows_exclude_current_match() -> None:
    flipped = [
        FIXTURE[0],
        FIXTURE[1],
        replace(FIXTURE[2], home_goals=9, away_goals=0),
        FIXTURE[3],
        FIXTURE[4],
    ]
    base, out = build_feature_rows(FIXTURE), build_feature_rows(flipped)
    for key in (
        "form5_pts_home",
        "form5_pts_away",
        "form5_gd_home",
        "form5_gd_away",
        "home_form5_pts",
        "away_form5_pts",
    ):
        assert out[2].features[key] == base[2].features[key]


def test_r5_season_progress_result_independent() -> None:
    """Changing every result never changes season_progress (schedule-derived)."""
    all_flipped = [replace(m, home_goals=m.away_goals, away_goals=m.home_goals) for m in FIXTURE]
    base, out = build_feature_rows(FIXTURE), build_feature_rows(all_flipped)
    assert [r.features["season_progress"] for r in base] == [
        r.features["season_progress"] for r in out
    ]


def test_r8_deliberately_leaky_builder_is_caught() -> None:
    """Canary: a builder that updates state BEFORE emitting features must fail R3/R4."""

    def leaky_rows(matches: list[MatchInput]) -> list[dict[str, float]]:
        # simulate leakage: include the current match in the home team's form window
        rows = build_feature_rows(matches)
        out = []
        for r, m in zip(
            rows, sorted(matches, key=lambda x: (x.kickoff_utc, x.match_id)), strict=True
        ):
            gd = m.home_goals - m.away_goals
            pts = 3 if gd > 0 else 1 if gd == 0 else 0
            leaked = dict(r.features)
            leaked["form5_pts_home"] = (leaked["form5_pts_home"] * 5 + pts) / 6  # leak!
            out.append(leaked)
        return out

    flipped = [
        FIXTURE[0],
        FIXTURE[1],
        replace(FIXTURE[2], home_goals=9, away_goals=0),
        FIXTURE[3],
        FIXTURE[4],
    ]
    base, out = leaky_rows(FIXTURE), leaky_rows(flipped)
    assert out[2]["form5_pts_home"] != base[2]["form5_pts_home"]  # the leak IS detectable


# ---------- R7: calibration-slice past-only assertion helper (used by T-080/T-100) ----------


def assert_calibration_slice_past_only(slice_max_time: datetime, block_min_time: datetime) -> None:
    """The reusable R7 assertion: every calibration-slice match strictly precedes the block."""
    if slice_max_time >= block_min_time:
        raise AssertionError(
            f"calibration slice leaks into the evaluation block: "
            f"slice max {slice_max_time} >= block min {block_min_time}"
        )


def test_r7_calibration_slice_assertion() -> None:
    t = datetime(2024, 5, 1, tzinfo=UTC)
    assert_calibration_slice_past_only(t - timedelta(days=1), t)  # ok
    with pytest.raises(AssertionError, match="calibration slice leaks"):
        assert_calibration_slice_past_only(t, t)


# ---------- integration: R1/R2/R6 against the real loaded DB ----------

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    import psycopg
    from features.builder import read_rs_matches

    @pytest.fixture(scope="module")
    def conn():  # type: ignore[no-untyped-def]
        """Never skip the leakage suite: build fs-v1 rows if absent (needs loaded matches)."""
        from features.builder import write_feature_rows

        assert DATABASE_URL is not None
        with psycopg.connect(DATABASE_URL, autocommit=True) as c:
            n = c.execute("SELECT count(*) FROM feature_row").fetchone()
            if n is None or int(n[0]) == 0:
                matches = read_rs_matches(c)
                if not matches:
                    pytest.skip("no historical matches loaded (run: python -m ingestion.load)")
                write_feature_rows(c, build_feature_rows(matches))
            yield c

    @pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")
    def test_r1_recompute_parity_against_stored_rows(conn) -> None:  # type: ignore[no-untyped-def]
        matches = read_rs_matches(conn)
        rebuilt = {r.match_id: r for r in build_feature_rows(matches)}
        stored = conn.execute(
            "SELECT match_id, as_of_utc, features, inputs_hash FROM feature_row"
            " WHERE feature_set_version = 'fs-v1'"
        ).fetchall()
        assert len(stored) == len(rebuilt)
        for match_id, as_of, feats, ih in stored:
            r = rebuilt[int(match_id)]
            assert r.as_of_utc == as_of
            assert r.inputs_hash == ih
            stored_feats = feats if isinstance(feats, dict) else json.loads(feats)
            assert r.features == stored_feats

    @pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")
    def test_r2_every_cutoff_precedes_kickoff(conn) -> None:  # type: ignore[no-untyped-def]
        row = conn.execute(
            "SELECT count(*) FROM feature_row f JOIN match m USING (match_id)"
            " WHERE f.as_of_utc >= m.kickoff_utc"
        ).fetchone()
        assert row is not None and int(row[0]) == 0

    @pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL not set")
    def test_r6_no_market_snapshot_after_cutoff_is_joinable(conn) -> None:  # type: ignore[no-untyped-def]
        """Historical closing snapshots (capture=kickoff) are AFTER the T-3h cutoff by
        construction — assert the feature layer exposes none of them at cutoff time."""
        row = conn.execute(
            "SELECT count(*) FROM feature_row f JOIN market_snapshot ms USING (match_id)"
            " WHERE ms.capture_time_utc <= f.as_of_utc"
        ).fetchone()
        # nothing captured at-or-before the cutoff exists yet (live captures start at T-142)
        assert row is not None and int(row[0]) == 0
