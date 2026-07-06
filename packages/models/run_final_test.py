"""T-260 PREP — the single-pass 2025 touch-once test script (Protocol §13/§14).

*** THIS SCRIPT MUST BE RUN EXACTLY ONCE, EVER. ***

Written and committed BEFORE execution (a §14 "Selection sealed" item) so the procedure itself
is pre-registered. Execution is triple-gated:
  1. every checkbox in docs/pre-final-test-checklist.md must be ticked ([ ] anywhere -> refuse);
  2. the environment must contain KICKLENS_RUN_FINAL_TEST=yes-i-am-sure (a deliberate act);
  3. the immutable output file must not already exist (one pass -> a second run refuses).

Pre-registered procedure (fixed now, before any 2025 data is touched):
- Evaluation mirrors the dev harness exactly: expanding walk-forward over 2025 matchweek
  blocks; training for each block = ALL dev matches (2017-2024) + completed earlier 2025
  blocks; every model refit per block on past-only data (same mechanics as T-080).
- Models evaluated in the SAME pass: B0, B1, B2, B3 (pre-registered fallback), B4, B5, and the
  frozen champion (logistic F1 C=0.1 + per-fold temperature on the trailing-20% slice), plus
  the de-vigged closing-market reference on the intersection subset.
- Metrics per Protocol §8 with 2,000-resample matchweek-block bootstrap CIs (seed 42); paired
  diffs: champion-vs-B3 and champion-vs-market. EVERY metric for EVERY model is reported
  (no selective omission).
- Results are written immutably to experiments/final_test_2025.json, appended to
  experiments/runs.jsonl, and published as the 'test'-scoped metrics snapshot.

Viewing these results FREEZES protocol v1.0 (Protocol §13): any later methodological change
requires a new MAJOR protocol version and a NEW reserved untouched season.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg
from common.config import load_settings

from models import metrics as mx
from models.baselines import (
    B0GlobalFloor,
    B1HomeAway,
    B2Expanding,
    B3EloOrdinal,
    B4Poisson,
    BaselineModel,
    b5_dixon_coles,
)
from models.bootstrap import block_bootstrap_mean, paired_diff
from models.calibration import fit_temperature
from models.champion import CHAMPION_NAME, make_champion
from models.market import load_market_probs
from models.runlog import record_run
from models.walkforward import (
    CALIBRATION_SLICE_FRACTION,
    Fold,
    Sample,
    week_key,
)

CHECKLIST = Path("docs/pre-final-test-checklist.md")
OUTPUT = Path("experiments/final_test_2025.json")
TEST_SEASON = 2025
SEED = 42
ENV_FLAG = "KICKLENS_RUN_FINAL_TEST"
ENV_VALUE = "yes-i-am-sure"


class FinalTestGateError(RuntimeError):
    """A §14 gate is not satisfied — the touch-once test may not run."""


def assert_gates_open(env: dict[str, str] | None = None) -> None:
    env = env if env is not None else dict(os.environ)
    if not CHECKLIST.is_file():
        raise FinalTestGateError(f"{CHECKLIST} missing")
    unticked = [
        line.strip()
        for line in CHECKLIST.read_text(encoding="utf-8").splitlines()
        if line.strip().startswith("- [ ]")
    ]
    if unticked:
        raise FinalTestGateError(
            "checklist has unticked boxes - DO NOT RUN (Protocol §14):\n  " + "\n  ".join(unticked)
        )
    if env.get(ENV_FLAG) != ENV_VALUE:
        raise FinalTestGateError(
            f"set {ENV_FLAG}={ENV_VALUE} to confirm the deliberate one-shot execution"
        )
    if OUTPUT.exists():
        raise FinalTestGateError(
            f"{OUTPUT} already exists - the 2025 test has been run; it may NEVER run again "
            "(Protocol §13: the burned season cannot be reused)"
        )


def load_dev_plus_test_samples(conn: psycopg.Connection) -> list[Sample]:
    """*** THE ONLY SANCTIONED READ OF THE 2025 SEASON FOR MODELING. ***
    walkforward.load_dev_samples stays hard-capped at 2024; this loader exists solely here."""
    rows = conn.execute(
        "SELECT m.match_id, s.year, m.kickoff_utc, f.features, m.result,"
        " m.home_team_id, m.away_team_id, m.home_goals, m.away_goals"
        " FROM feature_row f JOIN match m USING (match_id) JOIN season s USING (season_id)"
        " WHERE f.feature_set_version = 'fs-v1' AND m.is_regular_season"
        "   AND m.result IS NOT NULL AND s.year BETWEEN 2017 AND %s"
        " ORDER BY m.kickoff_utc, m.match_id",
        (TEST_SEASON,),
    ).fetchall()
    return [
        Sample(
            match_id=int(r[0]),
            season_year=int(r[1]),
            kickoff_utc=r[2],
            week=week_key(r[2]),
            features=r[3],
            outcome=str(r[4]),
            home_team_id=int(r[5]),
            away_team_id=int(r[6]),
            home_goals=int(r[7]),
            away_goals=int(r[8]),
        )
        for r in rows
    ]


def make_test_folds(samples: list[Sample]) -> list[Fold]:
    """Expanding folds whose evaluated blocks are the 2025 matchweeks (dev = training only)."""
    ordered = sorted(samples, key=lambda s: (s.kickoff_utc, s.match_id))
    blocks: dict[tuple[int, int], list[Sample]] = {}
    for s in ordered:
        blocks.setdefault(s.week, []).append(s)
    folds: list[Fold] = []
    for key in sorted(blocks):
        block = blocks[key]
        if block[0].season_year != TEST_SEASON:
            continue
        block_start = min(s.kickoff_utc for s in block)
        train = tuple(s for s in ordered if s.kickoff_utc < block_start)
        if max(s.kickoff_utc for s in train) >= block_start:  # R7
            raise AssertionError("training window leaks into the evaluation block")
        folds.append(Fold(block_key=key, train=train, block=tuple(block)))
    return folds


def evaluate_model(
    name: str, model: BaselineModel, folds: list[Fold], *, calibrate: bool = False
) -> tuple[dict[tuple[int, int], list[float]], dict[str, float]]:
    per_block: dict[tuple[int, int], list[float]] = {}
    probs: list[mx.Probs] = []
    outcomes: list[str] = []
    for fold in folds:
        model.fit(fold.train)
        cal = None
        if calibrate:
            k = max(1, round(CALIBRATION_SLICE_FRACTION * len(fold.train)))
            sl = fold.train[-k:]
            cal = fit_temperature([model.predict(s) for s in sl], [s.outcome for s in sl])
        losses = []
        for s in fold.block:
            p = model.predict(s)
            if cal is not None:
                p = cal.apply(p)
            probs.append(p)
            outcomes.append(s.outcome)
            losses.append(mx.log_loss_match(p, s.outcome))
        per_block[fold.block_key] = losses
    summary = mx.summarize(probs, outcomes)
    summary["classwise_ece_H"], summary["classwise_ece_D"], summary["classwise_ece_A"] = (
        mx.classwise_ece(probs, outcomes)[k] for k in ("H", "D", "A")
    )
    print(f"  {name}: " + " ".join(f"{k}={v:.4f}" for k, v in summary.items() if k != "n"))
    return per_block, summary


def main() -> int:
    assert_gates_open()
    settings = load_settings()
    with psycopg.connect(settings.database_url) as conn:
        samples = load_dev_plus_test_samples(conn)
        folds = make_test_folds(samples)
        n_eval = sum(len(f.block) for f in folds)
        print(f"[final-test] 2025 blocks={len(folds)} matches={n_eval} — ONE PASS, NO ITERATION")

        models: list[tuple[str, BaselineModel, bool]] = [
            ("B0", B0GlobalFloor(), False),
            ("B1", B1HomeAway(), False),
            ("B2", B2Expanding(all_samples=samples), False),
            ("B3-fallback", B3EloOrdinal(), False),
            ("B4", B4Poisson(), False),
            ("B5", b5_dixon_coles(), False),
            (CHAMPION_NAME, make_champion(), True),
        ]
        results: dict[str, dict[str, object]] = {}
        blocks: dict[str, dict[tuple[int, int], list[float]]] = {}
        for name, model, calibrate in models:
            per_block, summary = evaluate_model(name, model, folds, calibrate=calibrate)
            ci = block_bootstrap_mean(per_block, seed=SEED)
            blocks[name] = per_block
            results[name] = {
                **{k: round(v, 6) for k, v in summary.items()},
                "log_loss_ci95": [round(ci.ci_low, 6), round(ci.ci_high, 6)],
            }

        # market reference on the 2025 intersection
        market = {m.match_id: m for m in load_market_probs(conn, TEST_SEASON, TEST_SEASON)}
        mk_blocks: dict[tuple[int, int], list[float]] = {}
        ch_sub: dict[tuple[int, int], list[float]] = {}
        mk_probs: list[mx.Probs] = []
        mk_out: list[str] = []
        for fold in folds:
            mk_l, ch_l = [], []
            for i, s in enumerate(fold.block):
                mp = market.get(s.match_id)
                if mp is None:
                    continue
                mk_probs.append(mp.probs)
                mk_out.append(s.outcome)
                mk_l.append(mx.log_loss_match(mp.probs, s.outcome))
                ch_l.append(blocks[CHAMPION_NAME][fold.block_key][i])
            if mk_l:
                mk_blocks[fold.block_key] = mk_l
                ch_sub[fold.block_key] = ch_l
        results["market-closing"] = {
            **{k: round(v, 6) for k, v in mx.summarize(mk_probs, mk_out).items()},
        }

        d_b3 = paired_diff(blocks[CHAMPION_NAME], blocks["B3-fallback"], seed=SEED)
        d_mkt = paired_diff(ch_sub, mk_blocks, seed=SEED)
        comparisons = {
            "champion_minus_b3": {
                "mean": round(d_b3.mean, 6),
                "ci95": [round(d_b3.ci_low, 6), round(d_b3.ci_high, 6)],
            },
            "champion_minus_market": {
                "mean": round(d_mkt.mean, 6),
                "ci95": [round(d_mkt.ci_low, 6), round(d_mkt.ci_high, 6)],
            },
        }

        payload = {
            "protocol_version": "1.0",
            "season": TEST_SEASON,
            "n_matches": n_eval,
            "n_blocks": len(folds),
            "seed": SEED,
            "models": results,
            "comparisons": comparisons,
            "note": "one-shot touch-once result; protocol v1.0 is now frozen (Protocol §13)",
        }
        OUTPUT.parent.mkdir(exist_ok=True)
        OUTPUT.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        record_run(
            conn=conn,
            run_kind="FINAL-TEST-2025-ONE-SHOT",
            feature_set="fs-v1/F1",
            hyperparameters={"models": [m[0] for m in models]},
            fold_definitions={"n_folds": str(len(folds)), "season": str(TEST_SEASON)},
            metrics={"output_file": str(OUTPUT), "champion": results[CHAMPION_NAME]},
            random_seed=SEED,
        )
        from models.aggregation import write_snapshot

        write_snapshot(conn, "test", {**payload["models"][CHAMPION_NAME], "n": n_eval})  # type: ignore[index]
        print(f"[final-test] results written immutably to {OUTPUT}. DO NOT ITERATE.")
    return 0


if __name__ == "__main__":
    now = datetime.now(tz=None)  # noqa: DTZ005 — display only
    print(f"KickLens touch-once 2025 test — invoked {now}")
    sys.exit(main())
