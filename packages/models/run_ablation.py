"""T-090: logistic F0-F4 x C ablation on the dev walk-forward (RQ7).

Run: uv run python -m models.run_ablation
Selection rule (pre-registered, Protocol §1 RQ7 + §9 tie-break): pick the best config by pooled
dev log loss, then the champion candidate = the SMALLEST F-set whose best-C config sits within
the practical threshold (mean paired gap < 0.005 nats) of that best. Every config's run is
appended to experiments/runs.jsonl.
"""

from __future__ import annotations

import sys

import psycopg
from common.config import load_settings

from models.bootstrap import PRACTICAL_THRESHOLD_NATS, block_bootstrap_mean, paired_diff
from models.logistic import C_GRID, F_SETS, LogisticModel
from models.run_ladder import evaluate
from models.runlog import record_run
from models.walkforward import load_dev_samples, make_folds

SEED = 42


def main() -> int:
    settings = load_settings()
    with psycopg.connect(settings.database_url) as conn:
        samples = load_dev_samples(conn)
        folds = make_folds(samples)
        if not folds:
            raise SystemExit(
                "no dev folds - is the historical DB loaded? "
                "(run: python -m ingestion.load && python -m features.builder)"
            )
        print(f"[ablation] folds={len(folds)} configs={len(F_SETS) * len(C_GRID)}")

        results: dict[tuple[str, float], dict[tuple[int, int], list[float]]] = {}
        summaries: dict[tuple[str, float], dict[str, float]] = {}
        for f_set in F_SETS:
            for c in C_GRID:

                def make(f: str = f_set, cc: float = c) -> LogisticModel:
                    return LogisticModel(f_set=f, c=cc, seed=SEED)

                per_block, _p, _o, summary = evaluate(f"logistic-{f_set}-C{c}", make, folds)
                results[(f_set, c)] = per_block
                summaries[(f_set, c)] = summary
                ci = block_bootstrap_mean(per_block, seed=SEED)
                print(
                    f"  {f_set} C={c:<5}: log_loss={summary['log_loss']:.4f} "
                    f"[{ci.ci_low:.4f}, {ci.ci_high:.4f}] ece={summary['ece']:.4f} "
                    f"({summary['fit_seconds']}s)"
                )
                record_run(
                    conn=conn,
                    run_kind="logistic-ablation-dev",
                    feature_set=f"fs-v1/{f_set}",
                    hyperparameters={"model": "logistic", "C": c, "f_set": f_set},
                    fold_definitions={"n_folds": str(len(folds))},
                    metrics={
                        **{k: round(v, 6) for k, v in summary.items()},
                        "log_loss_ci95": [round(ci.ci_low, 6), round(ci.ci_high, 6)],
                    },
                    random_seed=SEED,
                )

        best_key = min(summaries, key=lambda k: summaries[k]["log_loss"])
        print(
            f"\n[ablation] best config: {best_key} log_loss={summaries[best_key]['log_loss']:.4f}"
        )

        # per-F best C, ordered smallest set first
        per_f_best = {
            f: min((k for k in summaries if k[0] == f), key=lambda k: summaries[k]["log_loss"])
            for f in F_SETS
        }
        selected: tuple[str, float] | None = None
        for f in F_SETS:  # F0..F4 = smallest first
            key = per_f_best[f]
            d = paired_diff(results[key], results[best_key], seed=SEED)
            within = d.mean < PRACTICAL_THRESHOLD_NATS
            print(
                f"  {f} (best C={key[1]}): gap vs best mean={d.mean:+.4f} "
                f"[{d.ci_low:+.4f}, {d.ci_high:+.4f}] within-threshold={within}"
            )
            if selected is None and within:
                selected = key
        assert selected is not None
        print(
            f"\n[ablation] SELECTED (smallest within threshold): f_set={selected[0]} "
            f"C={selected[1]} log_loss={summaries[selected]['log_loss']:.4f}"
        )
        record_run(
            conn=conn,
            run_kind="logistic-ablation-selection",
            feature_set=f"fs-v1/{selected[0]}",
            hyperparameters={"model": "logistic", "C": selected[1], "f_set": selected[0]},
            fold_definitions={"n_folds": str(len(folds))},
            metrics={
                "selected_log_loss": round(summaries[selected]["log_loss"], 6),
                "best_config": f"{best_key[0]}-C{best_key[1]}",
                "best_log_loss": round(summaries[best_key]["log_loss"], 6),
            },
            random_seed=SEED,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
