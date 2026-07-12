"""T-260 checklist gate: the touch-once script REFUSES to run while any §14 box is unticked,
without the deliberate env flag, or after its one permitted execution."""

import pytest
from models.run_final_test import ENV_FLAG, ENV_VALUE, FinalTestGateError, assert_gates_open


def test_gate_refuses_forever_after_the_one_permitted_run() -> None:
    # HISTORY: the test executed once on 2026-07-12 (experiments/final_test_2025.json).
    # From now until the end of the project, the gate must refuse ANY further run.
    with pytest.raises(FinalTestGateError, match="NEVER run again"):
        assert_gates_open({ENV_FLAG: ENV_VALUE})


def test_gate_refuses_on_unticked_checklist(
    monkeypatch: pytest.MonkeyPatch, tmp_path: object
) -> None:
    from pathlib import Path as P

    fake = P(str(tmp_path)) / "checklist.md"
    fake.write_text("- [x] done\n- [ ] not done\n", encoding="utf-8")
    monkeypatch.setattr("models.run_final_test.CHECKLIST", fake)
    with pytest.raises(FinalTestGateError, match="unticked"):
        assert_gates_open({ENV_FLAG: ENV_VALUE})


def test_gate_refuses_without_deliberate_env_flag() -> None:
    with pytest.raises(FinalTestGateError):
        assert_gates_open({})
