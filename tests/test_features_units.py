"""M2 unit tests: T-060 Elo, T-061 form, T-062 rest/context, T-063 fs-v1 builder."""

from datetime import UTC, datetime, timedelta

from features.elo import HOME_ADV, INIT_RATING, EloEngine, EloMatch, run_chronologically
from features.engine import (
    FEATURE_SET_VERSION,
    LEAGUE_MEAN_PPG,
    MatchInput,
    build_feature_rows,
)

T0 = datetime(2024, 3, 2, 0, 30, tzinfo=UTC)


def em(
    mid: int, days: float, home: int, away: int, hg: int, ag: int, season: int = 2024
) -> EloMatch:
    ko = T0 + timedelta(days=days)
    return EloMatch(mid, season, ko, ko.date(), home, away, hg, ag)


def mi(
    mid: int,
    days: float,
    home: int,
    away: int,
    hg: int,
    ag: int,
    season: int = 2024,
    neutral: bool = False,
) -> MatchInput:
    return MatchInput(mid, season, T0 + timedelta(days=days), home, away, hg, ag, neutral)


# ---------- T-060 Elo ----------


def test_new_teams_start_at_1500_and_home_expectation_uses_h60() -> None:
    engine = EloEngine()
    m = em(1, 0, 10, 20, 2, 0)
    pre_h, pre_a = engine.pre_match(m)
    assert pre_h == pre_a == INIT_RATING
    e = engine.expected_home(pre_h, pre_a)
    assert e == 1.0 / (1.0 + 10.0 ** (-HOME_ADV / 400.0))  # ≈ 0.585, not 0.5


def test_update_is_zero_sum_and_winner_gains() -> None:
    engine = EloEngine()
    post_h, post_a = engine.update(em(1, 0, 10, 20, 3, 1))
    assert post_h > INIT_RATING > post_a
    assert abs((post_h - INIT_RATING) + (post_a - INIT_RATING)) < 1e-9


def test_draw_moves_ratings_toward_underdog_adr001() -> None:
    # ADR-001: draws use G=1. Equal teams: home is the expected winner (H=60), so a draw
    # costs the home side and rewards the away side, zero-sum.
    engine = EloEngine()
    post_h, post_a = engine.update(em(1, 0, 10, 20, 1, 1))
    assert post_h < INIT_RATING < post_a
    assert abs((post_h - INIT_RATING) + (post_a - INIT_RATING)) < 1e-9
    # expected magnitude: K * 1 * (0.5 - E_home)
    e = EloEngine.expected_home(INIT_RATING, INIT_RATING)
    assert abs((post_h - INIT_RATING) - 20.0 * (0.5 - e)) < 1e-9


def test_upset_moves_more_than_expected_win() -> None:
    a, b = EloEngine(), EloEngine()
    a.ratings.update({10: 1600.0, 20: 1400.0})
    a.seasons.update({10: 2024, 20: 2024})
    b.ratings.update({10: 1400.0, 20: 1600.0})
    b.seasons.update({10: 2024, 20: 2024})
    fav_win = a.update(em(1, 0, 10, 20, 2, 0))[0] - 1600.0
    upset_win = b.update(em(1, 0, 10, 20, 2, 0))[0] - 1400.0
    assert upset_win > fav_win > 0


def test_season_boundary_regression_075() -> None:
    engine = EloEngine()
    engine.ratings[10] = 1600.0
    engine.seasons[10] = 2023
    r = engine._rating(10, 2024)
    assert r == 1500.0 + 0.75 * 100.0
    # within the same season: untouched
    engine.seasons[10] = 2024
    assert engine._rating(10, 2024) == 1600.0


def test_chronological_determinism_and_order_independence_of_input_list() -> None:
    ms = [em(1, 0, 10, 20, 2, 0), em(2, 3, 20, 30, 0, 1), em(3, 6, 10, 30, 1, 1)]
    a = run_chronologically(ms)
    b = run_chronologically(list(reversed(ms)))  # engine sorts internally
    assert [(x[0].match_id, x[3], x[4]) for x in a] == [(x[0].match_id, x[3], x[4]) for x in b]


def test_pre_match_excludes_current_match() -> None:
    ms = [em(1, 0, 10, 20, 2, 0), em(2, 7, 10, 20, 5, 0)]
    out = run_chronologically(ms)
    # match 2's PRE ratings equal match 1's POST ratings — its own 5-0 not yet included
    assert (out[1][1], out[1][2]) == (out[0][3], out[0][4])


# ---------- T-061/T-062/T-063 features ----------


def test_windows_exclude_current_match_and_shrink_on_cold_start() -> None:
    ms = [mi(1, 0, 10, 20, 3, 0), mi(2, 7, 10, 20, 0, 2)]
    rows = build_feature_rows(ms)
    # first match of the season: no history → league-mean shrink + cold-start flags
    f1 = rows[0].features
    assert f1["form5_pts_home"] == LEAGUE_MEAN_PPG and f1["form5_gd_home"] == 0.0
    assert f1["cold_start_home"] == 1.0 and f1["elo_diff"] == 0.0
    # second match: home team has exactly one prior (the 3-0 win) — its own result excluded
    f2 = rows[1].features
    assert f2["form5_pts_home"] == 3.0 and f2["form5_gd_home"] == 3.0
    assert f2["form5_pts_away"] == 0.0 and f2["form5_gd_away"] == -3.0


def test_home_away_venue_specific_form() -> None:
    # team 10 wins at home then loses away; its next HOME match sees home_form5_pts from
    # home matches only (the 3-0 win), not the away loss
    ms = [mi(1, 0, 10, 20, 3, 0), mi(2, 7, 30, 10, 2, 0), mi(3, 14, 10, 30, 1, 1)]
    rows = build_feature_rows(ms)
    f3 = rows[2].features
    assert f3["home_form5_pts"] == 3.0  # home-only window
    assert f3["form5_pts_home"] == 1.5  # overall window: (3+0)/2


def test_rest_days_capped_and_defaulted_and_congestion_window() -> None:
    ms = [mi(1, 0, 10, 20, 1, 0), mi(2, 40, 10, 20, 1, 0), mi(3, 43, 10, 30, 1, 0)]
    rows = build_feature_rows(ms)
    f1, f2, f3 = (r.features for r in rows)
    assert f1["rest_days_home"] == 7.0  # no prior → default
    assert f2["rest_days_home"] == 14.0  # 40 days → capped
    # kickoffs are 00:30 UTC; the T-3h cutoff lands the previous calendar day, so the
    # point-in-time rest from day-40 to day-43's cutoff is 2 days, not 3
    assert f3["rest_days_home"] == 2.0
    assert f2["congestion_home"] == 0.0 and f3["congestion_home"] == 1.0


def test_season_progress_is_schedule_derived_and_resets() -> None:
    ms = [
        mi(1, 0, 10, 20, 1, 0),
        mi(2, 7, 20, 10, 1, 0),
        mi(3, 370, 10, 20, 1, 0, season=2025),
        mi(4, 377, 20, 10, 1, 0, season=2025),
    ]
    rows = build_feature_rows(ms)
    assert [r.features["season_progress"] for r in rows] == [0.0, 0.5, 0.0, 0.5]


def test_neutral_site_flag_passthrough() -> None:
    rows = build_feature_rows([mi(1, 0, 10, 20, 1, 0, neutral=True)])
    assert rows[0].features["neutral_site"] == 1.0


def test_one_row_per_match_reproducible_with_stable_hash() -> None:
    ms = [mi(1, 0, 10, 20, 2, 1), mi(2, 7, 20, 10, 0, 0)]
    a, b = build_feature_rows(ms), build_feature_rows(ms)
    assert len(a) == 2
    assert [r.inputs_hash for r in a] == [r.inputs_hash for r in b]
    assert all(r.feature_set_version == FEATURE_SET_VERSION for r in a)
    assert all(
        r.as_of_utc == m.kickoff_utc - timedelta(hours=3) for r, m in zip(a, ms, strict=True)
    )
