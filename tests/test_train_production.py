"""E27: the launch training refuses to run before the touch-once test (integrity guard)."""

from pathlib import Path

import pytest
from models.train_production import FINAL_TEST_OUTPUT, TrainingOrderError, train_production


def test_refuses_before_final_test(monkeypatch: pytest.MonkeyPatch) -> None:
    # ensure the guard fires regardless of whether an artifact happens to exist locally
    monkeypatch.setattr(
        "models.train_production.FINAL_TEST_OUTPUT", Path("experiments/_nope_.json")
    )
    with pytest.raises(TrainingOrderError, match="touch-once"):
        train_production(conn=None, require_final_test=True)  # type: ignore[arg-type]


def test_final_test_output_path_is_the_sealed_artifact() -> None:
    # the guard watches the exact immutable output the one-shot test writes
    assert FINAL_TEST_OUTPUT.name == "final_test_2025.json"
