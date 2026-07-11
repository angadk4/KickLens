"""T-012: config loads from env, fails fast on missing keys, never leaks secrets."""

from pathlib import Path

import pytest
from common.config import ConfigError, load_settings

DB_URL = "postgresql://user:s3cret@localhost:5432/kicklens"


@pytest.fixture(autouse=True)
def _clean_provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Isolate from ambient env: migrations/env.py's load_dotenv() (run by the test-DB
    bootstrap in conftest) exports the developer's real .env keys into os.environ."""
    for key in (
        "API_FOOTBALL_KEY",
        "HIGHLIGHTLY_KEY",
        "SPORTSGAMEODDS_KEY",
        "NEON_DATABASE_URL",
        "KICKLENS_ENV",
    ):
        monkeypatch.delenv(key, raising=False)


def test_loads_from_overrides() -> None:
    s = load_settings({"DATABASE_URL": DB_URL, "API_FOOTBALL_KEY": "abc"}, dotenv_path=None)
    assert s.database_url == DB_URL
    assert s.api_football_key == "abc"
    assert s.env == "local"
    assert s.sportsgameodds_key is None


def test_missing_required_fails_fast_and_names_key_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ConfigError, match="DATABASE_URL"):
        load_settings(dotenv_path=None)


def test_empty_optional_becomes_none() -> None:
    s = load_settings({"DATABASE_URL": DB_URL, "HIGHLIGHTLY_KEY": ""}, dotenv_path=None)
    assert s.highlightly_key is None


def test_dotenv_file_loaded_but_env_wins(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    envfile = tmp_path / ".env"
    envfile.write_text(f"DATABASE_URL={DB_URL}\nAPI_FOOTBALL_KEY=from_file\n")
    monkeypatch.delenv("DATABASE_URL", raising=False)  # isolate from the ambient shell env
    monkeypatch.setenv("API_FOOTBALL_KEY", "from_env")
    s = load_settings(dotenv_path=envfile)
    assert s.database_url == DB_URL
    assert s.api_football_key == "from_env"


def test_repr_masks_secrets() -> None:
    s = load_settings({"DATABASE_URL": DB_URL, "API_FOOTBALL_KEY": "abc"}, dotenv_path=None)
    shown = repr(s)
    assert "s3cret" not in shown and "abc" not in shown and DB_URL not in shown
    assert "***" in shown and "env='local'" in shown


def test_cloud_ssm_path_requires_boto3() -> None:
    # locally boto3 is not installed; the cloud path must fail fast with a clear error
    # (in AWS runtimes boto3 is bundled and the path reads /kicklens/* SecureStrings)
    with pytest.raises(ConfigError, match="boto3"):
        load_settings({"KICKLENS_ENV": "cloud", "DATABASE_URL": DB_URL}, dotenv_path=None)
