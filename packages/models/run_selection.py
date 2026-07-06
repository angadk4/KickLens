"""T-101 + T-110 + T-092: calibration evaluation, market benchmark, and the promotion gates.

Run: uv run python -m models.run_selection
- Champion candidate: logistic F1, C=0.1 (the T-090 pre-registered selection).
- T-101 (RQ5): per-fold temperature fit on the trailing-20% calibration slice (OOF discipline:
  slice predictions come from the fold-trained model; the fitted T is applied to the block).
  Adopt temperature only if OOF log loss is not worse AND ECE not worse beyond +0.02 (A15).
- T-092 (Protocol §10): promotion gate vs the incumbent (B3 Elo): mean log-loss reduction
  >= 0.005 nats AND 95% block-bootstrap CI excludes 0 AND ECE within tolerance.
- T-110 (RQ6): de-vigged closing-market log loss on the same evaluated matches — descriptive
  stronger-information reference only.

This script REPORTS; it does not freeze anything. The freeze (and only then the 2025
touch-once test) happens with the developer witnessing the numbers.
"""

from __future__ import annotations

import sys

import psycopg
from common.config import load_settings

from models import metrics as mx
from models.baselines import B3EloOrdinal
from models.bootstrap import is_practical_improvement, paired_diff
from models.calibration import fit_temperature
from models.logistic import LogisticModel
from models.market import load_market_probs
from models.runlog import record_run
from models.walkforward import load_dev_samples, make_folds

SEED = 42
CHAMPION_F_SET = "F1"
CHAMPION_C = 0.1
ECE_TOLERANCE = 0.02  # A15


def main() -> int:
    settings = load_settings()
    with psycopg.connect(settings.database_url) as conn:
        samples = load_dev_samples(conn)
        folds = make_folds(samples)
        if not folds:
            raise SystemExit("no dev folds - load the historical DB first")

        raw_blocks: dict[tuple[int, int], list[float]] = {}
        cal_blocks: dict[tuple[int, int], list[float]] = {}
        b3_blocks: dict[tuple[int, int], list[float]] = {}
        raw_probs: list[mx.Probs] = []
        cal_probs: list[mx.Probs] = []
        b3_probs: list[mx.Probs] = []
        outcomes: list[str] = []
        temperatures: list[float] = []
        fallback_folds = 0
        evaluated_ids: list[int] = []

        b3 = B3EloOrdinal()
        for fold in folds:
            champ = LogisticModel(f_set=CHAMPION_F_SET, c=CHAMPION_C, seed=SEED)
            champ.fit(fold.train)
            b3.fit(fold.train)

            slice_probs = [champ.predict(s) for s in fold.calibration_slice]
            slice_outcomes = [s.outcome for s in fold.calibration_slice]
            cal = fit_temperature(slice_probs, slice_outcomes)
            if cal.fitted:
                temperatures.append(cal.temperature)
            else:
                fallback_folds += 1

            raw_losses, cal_losses, b3_losses = [], [], []
            for s in fold.block:
                p_raw = champ.predict(s)
                p_cal = cal.apply(p_raw)
                p_b3 = b3.predict(s)
                raw_probs.append(p_raw)
                cal_probs.append(p_cal)
                b3_probs.append(p_b3)
                outcomes.append(s.outcome)
                evaluated_ids.append(s.match_id)
                raw_losses.append(mx.log_loss_match(p_raw, s.outcome))
                cal_losses.append(mx.log_loss_match(p_cal, s.outcome))
                b3_losses.append(mx.log_loss_match(p_b3, s.outcome))
            raw_blocks[fold.block_key] = raw_losses
            cal_blocks[fold.block_key] = cal_losses
            b3_blocks[fold.block_key] = b3_losses

        raw_sum = mx.summarize(raw_probs, outcomes)
        cal_sum = mx.summarize(cal_probs, outcomes)
        b3_sum = mx.summarize(b3_probs, outcomes)

        # ---- T-101 / RQ5: adopt temperature only if not worse OOF (log loss AND ECE) ----
        d_cal = paired_diff(cal_blocks, raw_blocks, seed=SEED)
        t_mean = sum(temperatures) / len(temperatures) if temperatures else float("nan")
        adopt_temperature = d_cal.mean <= 0.0 and cal_sum["ece"] <= raw_sum["ece"] + ECE_TOLERANCE
        print(
            f"[T-101] raw:  log_loss={raw_sum['log_loss']:.4f} ece={raw_sum['ece']:.4f}\n"
            f"[T-101] temp: log_loss={cal_sum['log_loss']:.4f} ece={cal_sum['ece']:.4f} "
            f"(mean T={t_mean:.3f}, fitted {len(temperatures)}/{len(folds)} folds, "
            f"{fallback_folds} fallback-raw)\n"
            f"[T-101] paired diff temp-raw: {d_cal.mean:+.5f} "
            f"[{d_cal.ci_low:+.5f}, {d_cal.ci_high:+.5f}] -> "
            f"{'ADOPT temperature' if adopt_temperature else 'KEEP raw (fallback per A27)'}"
        )

        champ_blocks = cal_blocks if adopt_temperature else raw_blocks
        champ_sum = cal_sum if adopt_temperature else raw_sum

        # ---- T-092: promotion gate champion vs incumbent B3 ----
        d_gate = paired_diff(champ_blocks, b3_blocks, seed=SEED)
        gate_pass = (
            is_practical_improvement(d_gate) and champ_sum["ece"] <= b3_sum["ece"] + ECE_TOLERANCE
        )
        print(
            f"\n[T-092] incumbent B3: log_loss={b3_sum['log_loss']:.4f} ece={b3_sum['ece']:.4f}\n"
            f"[T-092] champion (logistic {CHAMPION_F_SET} C={CHAMPION_C}"
            f"{' + temperature' if adopt_temperature else ''}): "
            f"log_loss={champ_sum['log_loss']:.4f} ece={champ_sum['ece']:.4f}\n"
            f"[T-092] paired diff champion-B3: {d_gate.mean:+.5f} "
            f"[{d_gate.ci_low:+.5f}, {d_gate.ci_high:+.5f}]\n"
            f"[T-092] promotion gate (>=0.005 nats better AND CI excludes 0 AND ECE tol): "
            f"{'PASS' if gate_pass else 'NOT CLEARED - candidate is equivalent, not better'}"
        )

        # ---- T-110 / RQ6: market reference on the same evaluated matches ----
        market = {m.match_id: m for m in load_market_probs(conn, 2017, 2024)}
        mk_probs: list[mx.Probs] = []
        mk_outcomes: list[str] = []
        mk_blocks: dict[tuple[int, int], list[float]] = {}
        champ_sub_blocks: dict[tuple[int, int], list[float]] = {}
        champ_probs_all = cal_probs if adopt_temperature else raw_probs
        idx_by_match = {mid: i for i, mid in enumerate(evaluated_ids)}
        for fold in folds:
            mk_losses, ch_losses = [], []
            for s in fold.block:
                mp = market.get(s.match_id)
                if mp is None:
                    continue
                mk_probs.append(mp.probs)
                mk_outcomes.append(s.outcome)
                mk_losses.append(mx.log_loss_match(mp.probs, s.outcome))
                ch_losses.append(
                    mx.log_loss_match(champ_probs_all[idx_by_match[s.match_id]], s.outcome)
                )
            if mk_losses:
                mk_blocks[fold.block_key] = mk_losses
                champ_sub_blocks[fold.block_key] = ch_losses
        mk_sum = mx.summarize(mk_probs, mk_outcomes)
        d_mkt = paired_diff(champ_sub_blocks, mk_blocks, seed=SEED)
        print(
            f"\n[T-110] market (de-vigged closing, n={int(mk_sum['n'])}/{len(outcomes)} "
            f"intersection): log_loss={mk_sum['log_loss']:.4f} ece={mk_sum['ece']:.4f}\n"
            f"[T-110] champion-market gap: {d_mkt.mean:+.5f} "
            f"[{d_mkt.ci_low:+.5f}, {d_mkt.ci_high:+.5f}] "
            f"(descriptive only; market = stronger-information reference)"
        )

        record_run(
            conn=conn,
            run_kind="selection-report",
            feature_set=f"fs-v1/{CHAMPION_F_SET}",
            hyperparameters={
                "champion": f"logistic-{CHAMPION_F_SET}-C{CHAMPION_C}",
                "temperature_adopted": adopt_temperature,
                "incumbent": "B3",
            },
            fold_definitions={"n_folds": str(len(folds))},
            metrics={
                "champion_log_loss": round(champ_sum["log_loss"], 6),
                "champion_ece": round(champ_sum["ece"], 6),
                "b3_log_loss": round(b3_sum["log_loss"], 6),
                "gate_diff": round(d_gate.mean, 6),
                "gate_ci": [round(d_gate.ci_low, 6), round(d_gate.ci_high, 6)],
                "gate_pass": gate_pass,
                "mean_temperature": round(t_mean, 4),
                "market_log_loss": round(mk_sum["log_loss"], 6),
                "market_gap": round(d_mkt.mean, 6),
                "market_n": int(mk_sum["n"]),
            },
            random_seed=SEED,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
