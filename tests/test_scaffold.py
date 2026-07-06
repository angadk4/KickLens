"""T-010 placeholder: the monorepo packages import and carry a version."""

import common
import features
import ingestion
import models


def test_packages_import() -> None:
    for pkg in (common, ingestion, features, models):
        assert pkg.__version__ == "0.1.0"
