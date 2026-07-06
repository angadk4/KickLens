"""T-260 checklist gate: the touch-once script REFUSES to run while any §14 box is unticked,
without the deliberate env flag, or after its one permitted execution."""

import pytest
from models.run_final_test import ENV_FLAG, ENV_VALUE, FinalTestGateError, assert_gates_open


def test_gate_refuses_today_because_checklist_is_incomplete() -> None:
    # The real checklist currently has unticked boxes (final-test-time items) — the gate
    # must therefore refuse, no matter what the environment says.
    with pytest.raises(FinalTestGateError, match="unticked"):
        assert_gates_open({ENV_FLAG: ENV_VALUE})


def test_gate_refuses_without_deliberate_env_flag() -> None:
    with pytest.raises(FinalTestGateError):
        assert_gates_open({})
