"""T-091: LightGBM challenger experiment (E4). <=12 configs on F4; ships ONLY if it clears
the promotion gate vs the champion — the default is NOT to ship (Contract §6.3).

Run: uv run python -m models.run_challenger
"""

from __future__ import annotations

import sys
from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np
import psycopg
from common.config import load_settings

from models.bootstrap import block_bootstrap_mean, is_practical_improvement, paired_diff
from models.logistic import F_SETS, LogisticModel
from models.run_ladder import evaluate
from models.runlog import record_run
from models.walkforward import Sample, load_dev_samples, make_folds

SEED = 42
Probs = tuple[float, float, float]
_CLASSES = ("H", "D", "A")

# <=12 configs (cap enforced by test)
CONFIGS: tuple[dict[str, float | int], ...] = tuple(
    {"num_leaves": leaves, "learning_rate": lr, "n_estimators": 300}
    for leaves in (7, 15, 31)
    for lr in (0.02, 0.05, 0.1, 0.2)
)


@dataclass
class LgbmModel:
    params: dict[str, float | int]
    seed: int = 42
    name: str = "lgbm"
    _clf: object = field(default=None, repr=False)

    def _matrix(self, samples: Sequence[Sample]) -> np.ndarray:
        keys = F_SETS["F4"]
        return np.array([[s.features[k] for k in keys] for s in samples], dtype=float)

    def fit(self, train: Sequence[Sample]) -> None:
        import lightgbm as lgb

        x = self._matrix(train)
        y = np.array([_CLASSES.index(s.outcome) for s in train])
        kwargs: dict[str, object] = {
            "objective": "multiclass",
            "num_class": 3,
            "random_state": self.seed,
            "deterministic": True,
            "verbosity": -1,
            **self.params,
        }
        self._clf = lgb.LGBMClassifier(**kwargs).fit(x, y)  # type: ignore[arg-type]

    def predict(self, s: Sample) -> Probs:
        assert self._clf is not None
        raw = self._clf.predict_proba(self._matrix([s]))[0]  # type: ignore[attr-defined]
        return (float(raw[0]), float(raw[1]), float(raw[2]))


def main() -> int:
    settings = load_settings()
    assert len(CONFIGS) <= 12, "challenger config cap exceeded"
    with psycopg.connect(settings.database_url) as conn:
        samples = load_dev_samples(conn)
        folds = make_folds(samples)
        if not folds:
            raise SystemExit("no dev folds - load the historical DB first")

        # champion reference (raw probs; calibration would only help ECE, not log loss)
        champ_blocks, _p, _o, champ_sum = evaluate(
            "champion", lambda: LogisticModel(f_set="F1", c=0.1, seed=SEED), folds
        )
        print(f"[challenger] champion logistic-F1: log_loss={champ_sum['log_loss']:.4f}")

        best_key: dict[str, float | int] | None = None
        best_blocks = None
        best_ll = float("inf")
        for cfg in CONFIGS:

            def make(c: dict[str, float | int] = cfg) -> LgbmModel:
                return LgbmModel(params=dict(c), seed=SEED)

            per_block, _pp, _oo, summary = evaluate(
                f"lgbm-{cfg['num_leaves']}-{cfg['learning_rate']}", make, folds
            )
            ci = block_bootstrap_mean(per_block, seed=SEED)
            print(
                f"  leaves={cfg['num_leaves']:<3} lr={cfg['learning_rate']:<5}: "
                f"log_loss={summary['log_loss']:.4f} [{ci.ci_low:.4f}, {ci.ci_high:.4f}] "
                f"({summary['fit_seconds']}s)"
            )
            record_run(
                conn=conn,
                run_kind="lgbm-challenger-dev",
                feature_set="fs-v1/F4",
                hyperparameters={"model": "lightgbm", **cfg},
                fold_definitions={"n_folds": str(len(folds))},
                metrics={k: round(v, 6) for k, v in summary.items()},
                random_seed=SEED,
            )
            if summary["log_loss"] < best_ll:
                best_ll, best_key, best_blocks = summary["log_loss"], cfg, per_block

        assert best_blocks is not None
        d = paired_diff(best_blocks, champ_blocks, seed=SEED)
        ships = is_practical_improvement(d)
        print(
            f"\n[challenger] best lgbm {best_key}: log_loss={best_ll:.4f}\n"
            f"[challenger] paired diff lgbm-champion: {d.mean:+.5f} "
            f"[{d.ci_low:+.5f}, {d.ci_high:+.5f}]\n"
            f"[challenger] gate: {'SHIPS (clears gate)' if ships else 'DOES NOT SHIP (default)'}"
        )
        record_run(
            conn=conn,
            run_kind="lgbm-challenger-verdict",
            feature_set="fs-v1/F4",
            hyperparameters={"best": str(best_key)},
            fold_definitions={"n_folds": str(len(folds))},
            metrics={
                "best_log_loss": round(best_ll, 6),
                "diff_vs_champion": round(d.mean, 6),
                "ci": [round(d.ci_low, 6), round(d.ci_high, 6)],
                "ships": ships,
            },
            random_seed=SEED,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
