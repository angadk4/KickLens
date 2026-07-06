"""T-061/T-062/T-063: fs-v1 point-in-time feature engine (Contract §6.1).

Design guarantee: matches are walked chronologically and each match's features are emitted
BEFORE its result enters any state — the current match can never contribute to itself, and
no future match can contribute to an earlier cutoff. Only regular-season matches are walked
(non-RS matches never contribute to any feature and never get feature rows).

Cutoff = kickoff - 3h (T-3h). Frozen fill-ins: league-mean PPG 1.35; gd 0.0; rest default 7,
cap 14; congestion window 14 days; cold-start threshold 10 prior RS matches.

fs-v1 key naming: the Contract lists form features once; venue-agnostic form is emitted per
side (`*_home` / `*_away` = the home/away TEAM of this match), while `home_form5_pts` /
`away_form5_pts` are the venue-specific features (home team's last 5 HOME matches, away team's
last 5 AWAY matches) exactly as frozen. Registry: docs/fs-v1.md.

season_progress = (scheduled season matches with kickoff < cutoff) / (total scheduled season
matches) — schedule-derived (result-independent); matchweek-fraction approximated by
match-count fraction (see docs/fs-v1.md).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from features.elo import EloEngine, EloMatch

CUTOFF_BEFORE_KICKOFF = timedelta(hours=3)
LEAGUE_MEAN_PPG = 1.35
REST_DEFAULT_DAYS = 7
REST_CAP_DAYS = 14
CONGESTION_WINDOW = timedelta(days=14)
COLD_START_THRESHOLD = 10
FEATURE_SET_VERSION = "fs-v1"


@dataclass(frozen=True)
class MatchInput:
    match_id: int
    season_year: int
    kickoff_utc: datetime
    home_team_id: int
    away_team_id: int
    home_goals: int
    away_goals: int
    neutral_site: bool = False


@dataclass(frozen=True)
class CompletedEntry:
    """One completed RS match from one team's perspective."""

    kickoff_utc: datetime
    points: int
    goal_diff: int
    was_home: bool


@dataclass
class TeamHistory:
    entries: list[CompletedEntry] = field(default_factory=list)

    def before(self, cutoff: datetime) -> list[CompletedEntry]:
        return [e for e in self.entries if e.kickoff_utc < cutoff]


def _mean_pts(entries: list[CompletedEntry], k: int) -> float:
    window = entries[-k:]
    if not window:
        return LEAGUE_MEAN_PPG
    return sum(e.points for e in window) / len(window)


def _mean_gd(entries: list[CompletedEntry], k: int) -> float:
    window = entries[-k:]
    if not window:
        return 0.0
    return sum(e.goal_diff for e in window) / len(window)


def _rest_days(entries: list[CompletedEntry], cutoff: datetime) -> int:
    if not entries:
        return REST_DEFAULT_DAYS
    days = (cutoff.date() - entries[-1].kickoff_utc.date()).days
    return min(max(days, 0), REST_CAP_DAYS)


def _congestion(entries: list[CompletedEntry], cutoff: datetime) -> int:
    lo = cutoff - CONGESTION_WINDOW
    return sum(1 for e in entries if lo <= e.kickoff_utc < cutoff)


@dataclass(frozen=True)
class FeatureRow:
    match_id: int
    as_of_utc: datetime  # the T-3h cutoff
    feature_set_version: str
    features: dict[str, float]
    inputs_hash: str


def compute_features(
    m: MatchInput,
    cutoff: datetime,
    home_hist: list[CompletedEntry],
    away_hist: list[CompletedEntry],
    elo_home: float,
    elo_away: float,
    season_progress: float,
) -> dict[str, float]:
    home_home = [e for e in home_hist if e.was_home]
    away_away = [e for e in away_hist if not e.was_home]
    return {
        "elo_diff": elo_home - elo_away,
        "form5_pts_home": _mean_pts(home_hist, 5),
        "form5_pts_away": _mean_pts(away_hist, 5),
        "form10_pts_home": _mean_pts(home_hist, 10),
        "form10_pts_away": _mean_pts(away_hist, 10),
        "form5_gd_home": _mean_gd(home_hist, 5),
        "form5_gd_away": _mean_gd(away_hist, 5),
        "form10_gd_home": _mean_gd(home_hist, 10),
        "form10_gd_away": _mean_gd(away_hist, 10),
        "home_form5_pts": _mean_pts(home_home, 5),
        "away_form5_pts": _mean_pts(away_away, 5),
        "rest_days_home": float(_rest_days(home_hist, cutoff)),
        "rest_days_away": float(_rest_days(away_hist, cutoff)),
        "congestion_home": float(_congestion(home_hist, cutoff)),
        "congestion_away": float(_congestion(away_hist, cutoff)),
        "season_progress": season_progress,
        "cold_start_home": 1.0 if len(home_hist) < COLD_START_THRESHOLD else 0.0,
        "cold_start_away": 1.0 if len(away_hist) < COLD_START_THRESHOLD else 0.0,
        "neutral_site": 1.0 if m.neutral_site else 0.0,
    }


def inputs_hash(match_id: int, cutoff: datetime, features: dict[str, float]) -> str:
    canonical = json.dumps(
        {
            "match_id": match_id,
            "cutoff": cutoff.isoformat(),
            "features": features,
            "version": FEATURE_SET_VERSION,
        },
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def build_features_for_upcoming(
    completed: list[MatchInput],
    *,
    match_id: int,
    season_year: int,
    kickoff_utc: datetime,
    home_team_id: int,
    away_team_id: int,
    neutral_site: bool = False,
    season_scheduled_total: int | None = None,
    season_scheduled_before: int | None = None,
) -> FeatureRow:
    """fs-v1 row for a FUTURE fixture as of its T-3h cutoff: walk the completed history
    strictly before the cutoff, then compute — the same point-in-time discipline as the
    historical builder (the upcoming match has no result to leak by construction)."""
    cutoff = kickoff_utc - CUTOFF_BEFORE_KICKOFF
    history = [m for m in completed if m.kickoff_utc < cutoff]

    elo = EloEngine()
    hist: dict[int, TeamHistory] = {}
    for m in sorted(history, key=lambda x: (x.kickoff_utc, x.match_id)):
        em = EloMatch(
            match_id=m.match_id,
            season_year=m.season_year,
            order_key=m.kickoff_utc,
            match_date=m.kickoff_utc.date(),
            home_team_id=m.home_team_id,
            away_team_id=m.away_team_id,
            home_goals=m.home_goals,
            away_goals=m.away_goals,
        )
        elo.update(em)
        gd = m.home_goals - m.away_goals
        hist.setdefault(m.home_team_id, TeamHistory()).entries.append(
            CompletedEntry(m.kickoff_utc, 3 if gd > 0 else 1 if gd == 0 else 0, gd, True)
        )
        hist.setdefault(m.away_team_id, TeamHistory()).entries.append(
            CompletedEntry(m.kickoff_utc, 3 if gd < 0 else 1 if gd == 0 else 0, -gd, False)
        )

    pre_home = elo._rating(home_team_id, season_year)
    pre_away = elo._rating(away_team_id, season_year)
    # schedule-derived progress: caller supplies published-schedule counts; fallback = played
    if season_scheduled_total and season_scheduled_before is not None:
        progress = season_scheduled_before / season_scheduled_total
    else:
        played = sum(1 for m in history if m.season_year == season_year)
        progress = played / max(played + 1, 1)

    target = MatchInput(
        match_id=match_id,
        season_year=season_year,
        kickoff_utc=kickoff_utc,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        home_goals=0,
        away_goals=0,
        neutral_site=neutral_site,
    )
    feats = compute_features(
        target,
        cutoff,
        hist.get(home_team_id, TeamHistory()).before(cutoff),
        hist.get(away_team_id, TeamHistory()).before(cutoff),
        pre_home,
        pre_away,
        progress,
    )
    return FeatureRow(
        match_id=match_id,
        as_of_utc=cutoff,
        feature_set_version=FEATURE_SET_VERSION,
        features=feats,
        inputs_hash=inputs_hash(match_id, cutoff, feats),
    )


def build_feature_rows(matches: list[MatchInput]) -> list[FeatureRow]:
    """Walk RS matches chronologically; emit each match's fs-v1 row as of its T-3h cutoff.
    Deterministic; the current match and all later matches are structurally excluded."""
    ordered = sorted(matches, key=lambda x: (x.kickoff_utc, x.match_id))
    season_totals: dict[int, int] = {}
    for m in ordered:
        season_totals[m.season_year] = season_totals.get(m.season_year, 0) + 1
    season_seen: dict[int, int] = dict.fromkeys(season_totals, 0)

    elo = EloEngine()
    hist: dict[int, TeamHistory] = {}
    rows: list[FeatureRow] = []

    for m in ordered:
        cutoff = m.kickoff_utc - CUTOFF_BEFORE_KICKOFF
        em = EloMatch(
            match_id=m.match_id,
            season_year=m.season_year,
            order_key=m.kickoff_utc,
            match_date=m.kickoff_utc.date(),
            home_team_id=m.home_team_id,
            away_team_id=m.away_team_id,
            home_goals=m.home_goals,
            away_goals=m.away_goals,
        )
        pre_home, pre_away = elo.pre_match(em)
        home_hist = hist.setdefault(m.home_team_id, TeamHistory()).before(cutoff)
        away_hist = hist.setdefault(m.away_team_id, TeamHistory()).before(cutoff)
        # schedule-derived: matches scheduled strictly before this one within the season
        progress = season_seen[m.season_year] / season_totals[m.season_year]

        feats = compute_features(m, cutoff, home_hist, away_hist, pre_home, pre_away, progress)
        rows.append(
            FeatureRow(
                match_id=m.match_id,
                as_of_utc=cutoff,
                feature_set_version=FEATURE_SET_VERSION,
                features=feats,
                inputs_hash=inputs_hash(m.match_id, cutoff, feats),
            )
        )

        # ---- state updates AFTER emission (the leakage guarantee) ----
        season_seen[m.season_year] += 1
        elo.update(em)
        gd = m.home_goals - m.away_goals
        home_pts = 3 if gd > 0 else 1 if gd == 0 else 0
        away_pts = 3 if gd < 0 else 1 if gd == 0 else 0
        hist[m.home_team_id].entries.append(
            CompletedEntry(m.kickoff_utc, home_pts, gd, was_home=True)
        )
        hist[m.away_team_id].entries.append(
            CompletedEntry(m.kickoff_utc, away_pts, -gd, was_home=False)
        )
    return rows
