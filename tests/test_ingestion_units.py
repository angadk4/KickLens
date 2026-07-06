"""M1 unit tests (no DB): T-030 hashing/caching, T-031 normalization, T-032 filter,
T-041 report, T-050 gates."""

from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from ingestion.historical import fetch_usa_csv
from ingestion.normalize import (
    ColumnDriftError,
    NormalizedMatch,
    normalize_row,
    parse_file,
)
from ingestion.reconcile import ReconciliationReport
from ingestion.rs_filter import is_regular_season
from ingestion.validate import RejectRateExceeded, check, partition, quarantine, screen_odds

HEADER = (
    "Country,League,Season,Date,Time,Home,Away,HG,AG,Res,"
    "PSCH,PSCD,PSCA,MaxCH,MaxCD,MaxCA,AvgCH,AvgCD,AvgCA,"
    "BFECH,BFECD,BFECA,B365CH,B365CD,B365CA"
)
ROW = (
    "USA,MLS,2024,04/05/2024,02:30,Inter Miami,Atlanta Utd,2,1,H,"
    "1.80,3.90,4.20,1.85,4.00,4.30,1.78,3.85,4.10,,,,,,"
)


def _row(line: str) -> NormalizedMatch:
    m = normalize_row(dict(zip(HEADER.split(","), line.split(","), strict=True)), 1)
    assert m is not None
    return m


# ---------- T-031 normalization ----------


def test_normalize_maps_result_and_odds() -> None:
    m = _row(ROW)
    assert (m.home_goals, m.away_goals, m.result) == (2, 1, "H")
    assert m.season_year == 2024 and m.natural_key_date == date(2024, 5, 4)
    providers = {o.provider: o for o in m.odds}
    assert set(providers) == {"pinnacle", "market-avg", "market-max"}
    assert providers["pinnacle"].home == 1.80 and providers["pinnacle"].draw == 3.90


def test_normalize_converts_uk_local_to_utc() -> None:
    # 04/05/2024 02:30 UK (BST, UTC+1) == 2024-05-04 01:30 UTC (a US-evening kickoff)
    m = _row(ROW)
    assert m.kickoff_utc == datetime(2024, 5, 4, 1, 30, tzinfo=UTC)
    # winter row (GMT, UTC+0): 07/03/2020 22:00 UK == 22:00 UTC
    winter = ROW.replace("2024,04/05/2024,02:30", "2020,07/03/2020,22:00")
    assert _row(winter).kickoff_utc == datetime(2020, 3, 7, 22, 0, tzinfo=UTC)


def test_normalize_missing_odds_columns_yield_fewer_snapshots() -> None:
    no_pinnacle = ROW.replace("1.80,3.90,4.20", ",,")
    m = _row(no_pinnacle)
    assert {o.provider for o in m.odds} == {"market-avg", "market-max"}


def test_column_drift_fails_loudly(tmp_path: Path) -> None:
    bad = tmp_path / "USA.csv"
    bad.write_text("Country,League,Season,Date\nUSA,MLS,2024,04/05/2024\n")
    with pytest.raises(ColumnDriftError, match="missing required columns"):
        parse_file(bad)


def test_row_count_parity(tmp_path: Path) -> None:
    f = tmp_path / "USA.csv"
    f.write_text(HEADER + "\n" + ROW + "\n" + ROW.replace("04/05", "11/05") + "\n\n")
    rows, parse_rejects = parse_file(f)
    assert len(rows) == 2 and parse_rejects == []  # blank line skipped, both rows parsed


def test_corrupt_odds_value_skips_group_not_row() -> None:
    # real-file case: AvgCH == 'x' (2025 Atlanta vs New England) — provider skipped, row kept
    m = _row(ROW.replace("1.78,3.85,4.10", "x,3.85,4.10"))
    assert {o.provider for o in m.odds} == {"pinnacle", "market-max"}
    assert m.odds_issues and "market-avg" in m.odds_issues[0]


def test_malformed_row_becomes_parse_reject(tmp_path: Path) -> None:
    f = tmp_path / "USA.csv"
    bad = ROW.replace(",2,1,H,", ",two,1,H,")
    f.write_text(HEADER + "\n" + ROW + "\n" + bad + "\n")
    rows, parse_rejects = parse_file(f)
    assert len(rows) == 1 and len(parse_rejects) == 1
    assert parse_rejects[0][0] == 2  # line number reported


# ---------- T-032 regular-season filter ----------


def test_known_playoff_matches_excluded() -> None:
    assert not is_regular_season(2023, date(2023, 12, 9))  # MLS Cup 2023
    assert not is_regular_season(2025, date(2025, 12, 6))  # MLS Cup 2025
    assert not is_regular_season(2022, date(2022, 10, 15))  # first 2022 playoff round


def test_decision_day_evening_games_kept() -> None:
    # Decision Day 2024 = Oct 19; evening kickoffs appear as Oct 20 in the file (UK shift)
    assert is_regular_season(2024, date(2024, 10, 20))
    assert not is_regular_season(2024, date(2024, 10, 23))


def test_2020_mib_knockouts_excluded_group_stage_kept() -> None:
    assert not is_regular_season(2020, date(2020, 7, 26))  # knockout window
    assert is_regular_season(2020, date(2020, 7, 20))  # group stage counted


def test_unconfigured_season_excludes_nothing() -> None:
    assert is_regular_season(2026, date(2026, 12, 25))


# ---------- T-030 fetch/caching ----------


def test_fetch_falls_back_to_cache_when_unreachable(tmp_path: Path) -> None:
    cached_dir = tmp_path / "football-data" / "2026" / "07" / "05"
    cached_dir.mkdir(parents=True)
    (cached_dir / "USA-abcdef123456.csv").write_text(HEADER + "\n" + ROW + "\n")
    snap = fetch_usa_csv(
        tmp_path, url="http://127.0.0.1:9/unreachable", retry_delays=(), _sleep=lambda _s: None
    )
    assert snap.source_url == "cache" and snap.path.name.startswith("USA-")
    assert len(snap.sha256) == 64


def test_fetch_unreachable_without_cache_raises(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="no cached copy"):
        fetch_usa_csv(
            tmp_path, url="http://127.0.0.1:9/unreachable", retry_delays=(), _sleep=lambda _s: None
        )


# ---------- T-050 validation gates ----------


@pytest.mark.parametrize(
    ("mutation", "reason_fragment"),
    [
        (lambda r: r.replace(",2,1,H,", ",-1,1,A,"), "negative goals"),
        (lambda r: r.replace(",2,1,H,", ",2,1,A,"), "inconsistent with score"),
        (lambda r: r.replace("Atlanta Utd", "Inter Miami"), "home == away"),
        (lambda r: r.replace("2024,04/05/2024", "2024,04/05/2029"), "date outside season"),
    ],
)
def test_each_row_gate_rejects_crafted_bad_row(mutation, reason_fragment) -> None:  # type: ignore[no-untyped-def]
    reason = check(_row(mutation(ROW)))
    assert reason is not None and reason_fragment in reason


@pytest.mark.parametrize(
    ("mutation", "issue_fragment"),
    [
        (lambda r: r.replace("1.80,3.90,4.20", "0.95,3.90,4.20"), "odds <= 1"),
        (lambda r: r.replace("1.80,3.90,4.20", "1.10,1.10,1.10"), "overround"),
    ],
)
def test_implausible_odds_group_stripped_not_row_rejected(mutation, issue_fragment) -> None:  # type: ignore[no-untyped-def]
    m = screen_odds(_row(mutation(ROW)))
    assert check(m) is None  # the match row survives (missing-odds policy)
    assert "pinnacle" not in {o.provider for o in m.odds}
    assert any(issue_fragment in i for i in m.odds_issues)


def test_partition_dedupes_batch_and_passes_good_rows() -> None:
    good = _row(ROW)
    valid, rejects = partition([good, good])
    assert len(valid) == 1 and len(rejects) == 1
    assert rejects[0].reason == "duplicate natural key in batch"


class _FakeConn:
    def __init__(self) -> None:
        self.executed: list[str] = []

    def execute(self, sql: str, args: object = ()) -> None:
        self.executed.append(sql)


def test_reject_rate_over_5_percent_halts() -> None:
    bad = _row(ROW.replace(",2,1,H,", ",2,1,A,"))
    _, rejects = partition([bad])
    with pytest.raises(RejectRateExceeded):
        quarantine(_FakeConn(), rejects, "batch-x", total=10)  # type: ignore[arg-type]
    # 1 bad row in 100 stays under the limit
    quarantine(_FakeConn(), rejects, "batch-y", total=100)  # type: ignore[arg-type]


# ---------- T-041 reconciliation report ----------


def test_injected_conflict_appears_in_report() -> None:
    report = ReconciliationReport(source="football-data")
    report.record_conflict("2024:2024-05-04:AvB", "result", ("2", "1", "H"), ("2", "2", "D"), True)
    assert len(report.conflicts) == 1
    c = report.conflicts[0]
    assert c.resolution == "applied-incoming" and "conflicts=1" in report.summary()
