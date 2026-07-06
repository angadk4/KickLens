"""M3 baseline-ladder evaluation: B0-B5 on the dev walk-forward (2018-2024 blocks).

Run: uv run python -m models.run_ladder  (needs DATABASE_URL + loaded features).
Every baseline is refit per fold on past-only data; metrics pooled per match with
matchweek-block-bootstrap CIs; each rung's paired log-loss diff vs the previous rung is
tested against the practical threshold (>=0.005 nats AND 95% CI excludes 0).
Results are appended to experiments/runs.jsonl (T-083).
"""

from __future__ import annotations

import itertools
import sys
import time
from collections.abc import Callable, Sequence

import psycopg
from common.config import load_settings

from models import metrics as mx
from models.baselines import (
    B0GlobalFloor,
    B1HomeAway,
    B2Expanding,
    B3EloOrdinal,
    B4Poisson,
    b5_dixon_coles,
)
from models.bootstrap import block_bootstrap_mean, is_practical_improvement, paired_diff
from models.runlog import record_run
from models.walkforward import Fold, load_dev_samples, make_folds

SEED = 42


def evaluate(
    name: str,
    make_model: Callable[[], object],
    folds: Sequence[Fold],
) -> tuple[dict[tuple[int, int], list[float]], list[mx.Probs], list[str], dict[str, float]]:
    """Refit per fold, predict its block -> (per-block losses, probs, outcomes, summary)."""
    model = make_model()
    per_block: dict[tuple[int, int], list[float]] = {}
    probs: list[mx.Probs] = []
    outcomes: list[str] = []
    t0 = time.perf_counter()
    for fold in folds:
        model.fit(fold.train)  # type: ignore[attr-defined]
        losses = []
        for s in fold.block:
            p = model.predict(s)  # type: ignore[attr-defined]
            probs.append(p)
            outcomes.append(s.outcome)
            losses.append(mx.log_loss_match(p, s.outcome))
        per_block[fold.block_key] = losses
    summary = mx.summarize(probs, outcomes)
    summary["fit_seconds"] = round(time.perf_counter() - t0, 1)
    return per_block, probs, outcomes, summary


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
        n_eval = sum(len(f.block) for f in folds)
        print(
            f"[ladder] dev samples={len(samples)} folds={len(folds)} evaluated matches={n_eval} "
            f"(first block {folds[0].block_key}, last {folds[-1].block_key})"
        )

        ladder: list[tuple[str, Callable[[], object]]] = [
            ("B0", B0GlobalFloor),
            ("B1", B1HomeAway),
            ("B2", lambda: B2Expanding(all_samples=samples)),
            ("B3", B3EloOrdinal),
            ("B4", B4Poisson),
            ("B5", b5_dixon_coles),
        ]

        results: dict[str, dict[tuple[int, int], list[float]]] = {}
        summaries: dict[str, dict[str, float]] = {}
        for name, maker in ladder:
            per_block, _probs, _outcomes, summary = evaluate(name, maker, folds)
            results[name] = per_block
            summaries[name] = summary
            ci = block_bootstrap_mean(per_block, seed=SEED)
            print(
                f"  {name}: log_loss={summary['log_loss']:.4f} "
                f"[{ci.ci_low:.4f}, {ci.ci_high:.4f}]  rps={summary['rps']:.4f} "
                f"brier={summary['brier']:.4f} ece={summary['ece']:.4f} "
                f"acc={summary['accuracy']:.3f} n={int(summary['n'])} "
                f"({summary['fit_seconds']}s)"
            )
            record_run(
                conn=conn,
                run_kind="baseline-dev-walkforward",
                feature_set="fs-v1",
                hyperparameters={"model": name},
                fold_definitions={
                    "first_block": str(folds[0].block_key),
                    "last_block": str(folds[-1].block_key),
                    "n_folds": str(len(folds)),
                },
                metrics={
                    **{k: round(v, 6) for k, v in summary.items()},
                    "log_loss_ci95": [round(ci.ci_low, 6), round(ci.ci_high, 6)],
                },
                random_seed=SEED,
            )

        print("\n[ladder] paired log-loss diffs (rung - previous; negative = better):")
        names = [n for n, _ in ladder]
        for prev, cur in itertools.pairwise(names):
            d = paired_diff(results[cur], results[prev], seed=SEED)
            verdict = "PRACTICAL" if is_practical_improvement(d) else "not practical"
            print(
                f"  {cur} vs {prev}: mean={d.mean:+.4f} "
                f"[{d.ci_low:+.4f}, {d.ci_high:+.4f}] -> {verdict}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
