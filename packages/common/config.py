"""Typed application settings (T-012).

Sources, in precedence order:
1. an explicit mapping passed to ``load_settings`` (tests),
2. process environment variables,
3. a local ``.env`` file (never overrides real env vars).

In cloud (``KICKLENS_ENV=cloud``) values will come from SSM Parameter Store; that
path is deliberately a stub until deployment work starts (M8, T-220+).

Secrets never appear in logs: ``Settings`` masks every sensitive field in its repr,
and error messages name missing *keys* only, never values.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, fields
from pathlib import Path

from dotenv import dotenv_values

__all__ = ["ConfigError", "Settings", "load_settings"]

_REQUIRED = ("DATABASE_URL",)
_OPTIONAL = ("API_FOOTBALL_KEY", "HIGHLIGHTLY_KEY", "SPORTSGAMEODDS_KEY", "NEON_DATABASE_URL")
_NON_SECRET_FIELDS = frozenset({"env"})


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or a source is unavailable."""


@dataclass(frozen=True)
class Settings:
    """Immutable, fully-typed runtime configuration."""

    env: str  # "local" | "cloud"
    database_url: str
    api_football_key: str | None
    highlightly_key: str | None
    sportsgameodds_key: str | None
    neon_database_url: str | None

    def __repr__(self) -> str:  # never leak secret values
        parts = []
        for f in fields(self):
            value = getattr(self, f.name)
            if f.name in _NON_SECRET_FIELDS:
                parts.append(f"{f.name}={value!r}")
            else:
                parts.append(f"{f.name}={'***' if value else None!r}")
        return f"Settings({', '.join(parts)})"

    __str__ = __repr__


def _from_ssm(prefix: str) -> Mapping[str, str]:
    raise ConfigError(
        "SSM Parameter Store config source is not implemented until deployment (M8, T-220+); "
        "unset KICKLENS_ENV or set it to 'local'."
    )


def load_settings(
    overrides: Mapping[str, str] | None = None,
    dotenv_path: str | Path | None = ".env",
) -> Settings:
    """Load settings, failing fast (with key names only) if required keys are missing."""
    merged: dict[str, str] = {}
    if dotenv_path is not None and Path(dotenv_path).is_file():
        merged.update({k: v for k, v in dotenv_values(dotenv_path).items() if v})
    merged.update(os.environ)
    merged.update(overrides or {})

    env = merged.get("KICKLENS_ENV", "local")
    if env == "cloud":
        merged.update(_from_ssm(prefix="/kicklens/"))

    missing = [key for key in _REQUIRED if not merged.get(key)]
    if missing:
        raise ConfigError(
            f"missing required configuration key(s): {', '.join(missing)} — "
            "set them in the environment or .env (see .env.example)"
        )

    def opt(key: str) -> str | None:
        return merged.get(key) or None

    return Settings(
        env=env,
        database_url=merged["DATABASE_URL"],
        api_football_key=opt("API_FOOTBALL_KEY"),
        highlightly_key=opt("HIGHLIGHTLY_KEY"),
        sportsgameodds_key=opt("SPORTSGAMEODDS_KEY"),
        neon_database_url=opt("NEON_DATABASE_URL"),
    )
