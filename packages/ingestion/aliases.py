"""T-040: team-alias map — seed `team`/`team_alias` and resolve provider names to team_id.

Canonical names come from football-data.co.uk (the historical base). The draft produced by
spike T-005 (`resources/team_aliases_draft.json`) supplies api-football + highlightly ids;
this module additionally registers each canonical name under provider 'football-data'.
Unresolved names BLOCK ingestion (fail loudly) per the backlog fail-stop.
"""

from __future__ import annotations

import json
from importlib import resources as importlib_resources
from typing import Any

import psycopg

FOOTBALL_DATA_PROVIDER = "football-data"


class UnresolvedTeamError(RuntimeError):
    """A provider team name has no alias mapping — ingestion must stop, not guess."""


def load_draft() -> dict[str, Any]:
    ref = importlib_resources.files("ingestion").joinpath("resources/team_aliases_draft.json")
    return json.loads(ref.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def seed_teams_and_aliases(conn: psycopg.Connection, draft: dict[str, Any] | None = None) -> int:
    """Create team rows for every canonical name and alias rows for every provider mapping.
    Idempotent (ON CONFLICT DO NOTHING). Returns the number of teams present after seeding."""
    draft = draft or load_draft()
    canonical: set[str] = {a["canonical"] for a in draft["aliases"]}
    canonical.update(draft.get("canonical_without_provider_id", []))
    defunct = set(draft.get("defunct", []))

    for name in sorted(canonical):
        conn.execute(
            "INSERT INTO team (canonical_name, is_defunct) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (name, name in defunct),
        )
        conn.execute(
            "INSERT INTO team_alias (provider, provider_key, team_id)"
            " SELECT %s, %s, team_id FROM team WHERE canonical_name = %s"
            " ON CONFLICT DO NOTHING",
            (FOOTBALL_DATA_PROVIDER, name, name),
        )
    for a in draft["aliases"]:
        conn.execute(
            "INSERT INTO team_alias (provider, provider_key, team_id)"
            " SELECT %s, %s, team_id FROM team WHERE canonical_name = %s"
            " ON CONFLICT DO NOTHING",
            (a["provider"], a["provider_key"], a["canonical"]),
        )
    row = conn.execute("SELECT count(*) FROM team").fetchone()
    assert row is not None
    return int(row[0])


def resolver(conn: psycopg.Connection, provider: str) -> dict[str, int]:
    """provider_key -> team_id map for one provider (load once per batch)."""
    rows = conn.execute(
        "SELECT provider_key, team_id FROM team_alias WHERE provider = %s", (provider,)
    ).fetchall()
    return {str(k): int(t) for k, t in rows}


def resolve_or_raise(mapping: dict[str, int], provider: str, key: str) -> int:
    team_id = mapping.get(key)
    if team_id is None:
        raise UnresolvedTeamError(
            f"no team_alias for provider={provider!r} key={key!r}; "
            "add it to the alias map before ingesting (T-040 fail-stop)"
        )
    return team_id
