# Model card — KickLens MLS 1X2 champion

**Model:** multinomial logistic regression (L2, C=0.1) on two inputs — Elo rating difference
and a neutral-site flag — with per-training temperature-scaled calibration (mean fitted
T ≈ 1.16). **Selection sealed 2026-07-06**, pre-registered under protocol v1.0 (git tag
`protocol-v1.0`). Pre-registered fallback: Elo ordered-logit (B3). Source of truth:
`packages/models/champion.py`.

## Intended use

Public probabilistic forecasts (home/draw/away) for **MLS regular-season matches**, frozen at
kickoff − 3 hours and never revised. This is a methodological transparency project.
**It is not betting advice**; the de-vigged closing market has strictly better information and
outperformed this model on development data.

## Training data

MLS regular seasons 2017–2024 (dev era), 3,386 matches from football-data.co.uk, playoff and
non-league matches excluded by a verified date-window rule; features are strictly point-in-time
as of the T-3h cutoff (fs-v1; leakage suite R1–R8 enforced in CI). See `docs/data-card.md`.

## Performance — dev evidence (2018–2024 expanding walk-forward, 210 blocks / 3,012 matches)

| Metric | Value [95% CI] |
|---|---|
| Log loss | **1.0346** [1.018, 1.051] |
| RPS | 0.2168 |
| ECE (10-bin) | **0.0108** (raw: 0.032 — temperature adopted) |
| Accuracy (diagnostic) | 0.493 |

**Honest context, in order of importance:**

1. **The champion is statistically equivalent to a plain Elo baseline** (paired diff +0.0001
   nats, 95% CI [−0.003, +0.003]). We claim calibration quality and auditability — never
   predictive superiority over Elo.
2. **The market is better.** De-vigged Pinnacle closing odds scored 1.0149 on the identical
   matches — 0.0197 nats ahead [0.013, 0.027]. Closing odds embed team news up to kickoff;
   this model freezes 3 hours earlier on public data only.
3. Form, rest, congestion and schedule features added **no** signal beyond Elo (pre-registered
   F0–F4 ablation); a LightGBM challenger was decisively worse (+0.039 nats). Simple won on
   the evidence, not on aesthetics.

## Test evidence (2025 season)

**Pending — sealed.** The 2025 season is a touch-once test set that has never been used for
any decision. It will be evaluated exactly once (`run_final_test.py`, triple-gated) and the
result published whatever it says, per `docs/final-test-report-template.md`.

## Live record

Begins empty at MLS resumption (July 2026). Every official forecast is SHA-256-hashed and
anchored to a public git file before kickoff; grading is automated; the record is never
back-filled. Live metrics are reported separately from dev/test/backtest evidence, always with
sample sizes (small live samples are extremely noisy — the dashboard says so).

## Limitations

- Draws (~25% of MLS matches) are the hardest outcome for any model in this class.
- No lineups, injuries, transfers, weather, or travel data (post-MVP candidates, most paid).
- Historical kickoff timestamps are approximate (source file is UK-local day-granular).
- Retraining is monthly in-season with online Elo updates; a mid-month shock (e.g. a star
  transfer) reaches the model only through match results.
- One club (San Diego FC) has under two seasons of history; cold-start shrinkage applies.

## Maintenance

Monthly retrain (1st, 10:00 UTC) produces a challenger evaluated against the incumbent under
the frozen promotion gate (≥0.005 nats AND CI excludes 0 AND ECE tolerance); rollback =
repointing the registry's production flag. Any methodological change requires a new protocol
version; the 2025 test can never be reused.
