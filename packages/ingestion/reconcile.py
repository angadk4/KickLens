"""T-041: source-of-truth rules + conflict logging.

Rules (Contract §5): for prior complete seasons football-data.co.uk wins on results/odds;
for the current season the live provider wins on results. Conflicts (an incoming row that
disagrees with what is already stored) are LOGGED, never silently dropped or overwritten;
the winning source's value is applied only per the rules above.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Field = Literal["home_goals", "away_goals", "result", "kickoff_utc"]


@dataclass(frozen=True)
class Conflict:
    match_key: str
    field: Field
    stored: str
    incoming: str
    source: str
    resolution: str  # "kept-stored" | "applied-incoming"


@dataclass
class ReconciliationReport:
    source: str
    inserted: int = 0
    unchanged: int = 0
    conflicts: list[Conflict] = field(default_factory=list)

    def record_conflict(
        self, match_key: str, fld: Field, stored: object, incoming: object, applied: bool
    ) -> None:
        self.conflicts.append(
            Conflict(
                match_key=match_key,
                field=fld,
                stored=str(stored),
                incoming=str(incoming),
                source=self.source,
                resolution="applied-incoming" if applied else "kept-stored",
            )
        )

    def summary(self) -> str:
        return (
            f"source={self.source} inserted={self.inserted} unchanged={self.unchanged} "
            f"conflicts={len(self.conflicts)}"
        )
