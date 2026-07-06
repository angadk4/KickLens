"""Test bootstrap: when DATABASE_URL is set, ensure the schema exists before any test runs
(removes ordering dependence on a fresh test database)."""

import os

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    from alembic import command
    from alembic.config import Config

    def pytest_configure(config: object) -> None:
        command.upgrade(Config("alembic.ini"), "head")
