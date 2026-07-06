"""T-031: normalize historical CSV rows → canonical match + closing market snapshots.

Facts established by spikes E1/E2 (docs/spikes/):
- `Date`/`Time` are **UK-local (Europe/London)** → converted to UTC, `kickoff_approx=true`;
- the natural key keeps the file's own (UK-local) date — identity, not kickoff;
- odds columns are closing-only; Pinnacle (PSC*) primary, market average (AvgC*) consensus,
  MaxC* retained. Historical closing snapshots use `capture_time_utc = kickoff_utc` with
  `is_closing=true` (deterministic → idempotent re-ingest).

Column drift fails loudly (backlog fail-stop): required columns missing → ColumnDriftError.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")

REQUIRED_COLUMNS = (
    "Country",
    "League",
    "Season",
    "Date",
    "Time",
    "Home",
    "Away",
    "HG",
    "AG",
    "Res",
    "PSCH",
    "PSCD",
    "PSCA",
    "AvgCH",
    "AvgCD",
    "AvgCA",
    "MaxCH",
    "MaxCD",
    "MaxCA",
)

ODDS_PROVIDERS = (  # provider label -> column prefix
    ("pinnacle", "PSC"),
    ("market-avg", "AvgC"),
    ("market-max", "MaxC"),
)


class ColumnDriftError(RuntimeError):
    """The source file's columns changed — stop, never silently coerce."""


@dataclass(frozen=True)
class ClosingOdds:
    provider: str
    home: float
    draw: float
    away: float


@dataclass(frozen=True)
class NormalizedMatch:
    season_year: int
    natural_key_date: date  # the file's own (UK-local) date — identity
    kickoff_utc: datetime  # converted; approximate by definition
    home_name: str
    away_name: str
    home_goals: int
    away_goals: int
    result: str  # 'H' | 'D' | 'A'
    odds: tuple[ClosingOdds, ...]
    source_line: int  # 1-based data-row number, for reject reporting
    odds_issues: tuple[str, ...] = ()  # per-provider unparseable prices (row still valid)


def parse_file(path: Path) -> tuple[list[NormalizedMatch], list[tuple[int, str]]]:
    """Parse the file → (matches, parse_rejects). A malformed row becomes a (line, reason)
    reject headed for quarantine — one bad row must never sink the batch."""
    matches: list[NormalizedMatch] = []
    parse_rejects: list[tuple[int, str]] = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        missing = [c for c in REQUIRED_COLUMNS if c not in header]
        if missing:
            raise ColumnDriftError(f"USA.csv is missing required columns: {missing}")
        for i, row in enumerate(reader, start=1):
            try:
                m = normalize_row(row, i)
            except ValueError as exc:
                parse_rejects.append((i, str(exc)))
                continue
            if m is not None:
                matches.append(m)
    return matches, parse_rejects


def normalize_row(row: dict[str, str], line: int) -> NormalizedMatch | None:
    """One CSV row → NormalizedMatch. Returns None for blank lines; raises ValueError on
    malformed values (callers route those to quarantine via T-050)."""
    if not (row.get("Date") or "").strip():
        return None
    season = int(row["Season"])
    # intermediate naive values are deliberately localized to Europe/London two lines below
    d = datetime.strptime(row["Date"].strip(), "%d/%m/%Y")  # noqa: DTZ007
    t = (
        datetime.strptime(row["Time"].strip(), "%H:%M").time()  # noqa: DTZ007
        if row.get("Time", "").strip()
        else None
    )
    naive = datetime.combine(d.date(), t) if t else datetime.combine(d.date(), datetime.min.time())
    kickoff_utc = naive.replace(tzinfo=UK).astimezone(UTC)

    hg, ag = int(row["HG"]), int(row["AG"])
    result = row["Res"].strip().upper()
    if result not in ("H", "D", "A"):
        raise ValueError(f"line {line}: invalid Res {row['Res']!r}")

    odds: list[ClosingOdds] = []
    odds_issues: list[str] = []
    for provider, prefix in ODDS_PROVIDERS:
        vals = [(row.get(f"{prefix}{s}") or "").strip() for s in ("H", "D", "A")]
        if all(vals):
            try:
                odds.append(ClosingOdds(provider, float(vals[0]), float(vals[1]), float(vals[2])))
            except ValueError:
                # a corrupt price (e.g. literal 'x' in the real file) = missing for that
                # provider only (Contract §5 missing-odds policy); the match row survives
                odds_issues.append(f"{provider} odds unparseable: {vals}")

    return NormalizedMatch(
        season_year=season,
        natural_key_date=d.date(),
        kickoff_utc=kickoff_utc,
        home_name=row["Home"].strip(),
        away_name=row["Away"].strip(),
        home_goals=hg,
        away_goals=ag,
        result=result,
        odds=tuple(odds),
        source_line=line,
        odds_issues=tuple(odds_issues),
    )
