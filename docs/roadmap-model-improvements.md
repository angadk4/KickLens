# Roadmap — model improvements (post-launch challengers)

> **Status: planned, not started.** Captured 2026-07-14 from a design discussion. This is the
> agreed plan for safely improving the forecaster *after* the 2026-07-16 launch, without
> overfitting and without touching the frozen champion, the spent 2025 test, or the live loop.
> When someone says "let's come back to the xG idea / model improvements," this is the doc.

## TL;DR
The champion (multinomial logistic on `{elo_diff, neutral_site}` + temperature) is
**statistically equivalent to plain Elo** on dev and ~0.02 nats behind the closing market.
Within its current information set it is **near its ceiling** — the dev ablations already showed
form/rest/congestion add nothing, and the goal-based models (Poisson, Dixon-Coles) lost to Elo.
So real improvement requires **new information**, not more feature-engineering on the same data.
The lead candidate is **xG**. Any improvement ships as a **challenger** validated on the
**2026 live season** — the 2025 touch-once test is spent and can never be reused.

## Why this wasn't in v1 (so we don't re-litigate it)
- The historical source (`new/USA.csv`, football-data.co.uk) has **results + closing odds, no
  xG**. xG lives in a *different* provider (Understat / FBref) → adding it means a whole second
  data pipeline (fetch + team-identity reconciliation + backfill + point-in-time correctness).
- The project was deliberately **minimal-first** ("prefer the simplest defensible
  implementation"; ship the *system* and the *rigor*, don't gold-plate under a deadline).
- The **evidence** said more data was a weak bet for v1: the free in-dataset features
  (form/rest/congestion) added nothing over Elo, and the goal-based ladder rungs (B4 Poisson
  1.2299, B5 Dixon-Coles 1.0627) both lost to Elo (B3 1.0345). Not a mistake — a scoping call.
- Framing: "shipped a rigorous v1 and scoped xG as the principled next experiment" is a
  **roadmap**, not a gap. v1 → v2 → v3 is the healthy ML lifecycle.

## The three data levers (ranked by payoff vs. acquisition risk)
The two constraints that decide feasibility are **point-in-time capture** (the feature must
reflect only what was knowable at T−3h) and **backfillability** (you need a leakage-safe
*historical* version to validate on the walk-forward).

1. **xG — do this first (tractable).** Post-match statistic → **leakage-safe by construction**
   (only ever use xG from matches completed before the cutoff) and **fully backfillable**
   (Understat/FBref have historical MLS xG). Can be dev-validated on 2017–2024 immediately.
   Honest caveat: may come back **null** (redundant with Elo, which already encodes results-based
   strength). A clean null is still a good, publishable result.
2. **Lineups / availability — highest signal, worst data profile.** The biggest thing the market
   knows that the model doesn't. But: *confirmed* XI come ~1h pre-match — **after the T−3h
   cutoff** — so only **injury/suspension/projected** data is usable at the cutoff. And it
   **can't be backfilled** point-in-time → you must **capture it live now and validate a season
   later** (multi-season commitment). Needs a paid feed (API-Football/Sportmonks ~$10–30/mo) or
   the MLS official Availability Report (scraping), or check whether Highlightly already exposes
   it. **Cannot be shown this month** — no honest historical numbers exist.
3. **Market odds as a feature — cheapest, positioning cost.** SGO is already ingested; using the
   opening line as a feature would near-certainly cut log loss — but it **collapses the
   independent "fair market comparison"** (the model would consume the thing it's measured
   against). Only honest if re-positioned as "incorporates market signal"; forfeits the
   independent-forecaster claim. Deprioritized.

## The hard discipline (non-negotiable — this is the project's value)
- **The 2025 touch-once test is SPENT.** It was valid only because no one had seen it. Deleting
  the files does **not** restore a clean test — the outcome is now known to the builder (human
  *and* the AI/agent, which reads the repo each session). Any model re-tested on 2025 is
  contaminated (optimistically biased). This is epistemic, not a rule you can engineer around.
- A genuinely validated improvement needs a **fresh untouched season**. That is **2026 live**.
  The champion is already frozen (trained through 2025) so its whole 2026 record is a clean
  out-of-sample test; a challenger gets an equally clean test only if **frozen before it sees
  2026 results** (freeze before/early in the season → maximal clean window).
- The champion **stays the official 2026 forecaster** regardless — a challenger has not *earned*
  the public, anchored record until it clears the gate. Never put an unvalidated model in the
  tamper-evident record.

## Champion/challenger mechanics (the workflow the system was designed for)
1. **Train** both on 2017–2025; the challenger adds the xG feature (fs-v2). Dev-validate the new
   feature on the **2018–2024 expanding walk-forward** first.
2. **Freeze + publicly pre-commit** the challenger artifact (hash/tag it) *before* the 2026 test
   window, so "frozen before it saw 2026" is verifiable — same discipline as the sealed test.
3. **Shadow evaluation:** both models forecast every 2026 fixture at the same T−3h cutoff from
   point-in-time features. Champion's forecast is the **official, anchored, public** one; the
   challenger runs **alongside in shadow** (logged, not public). Either run live xG ingestion, or
   reconstruct the challenger's point-in-time 2026 forecasts at season's end (clean as long as the
   artifact was pre-frozen and features use only pre-cutoff xG).
4. **Grade both** on the same results → accumulate a **paired** champion-vs-challenger comparison.
5. **Apply the frozen gate:** ≥ **0.005 nats** mean improvement AND the 95%
   matchweek-block-bootstrap CI (2,000 resamples) of the paired difference **excludes 0**.
   - Clears it → **promote to v2** (`model_version` registry + `promote()` already exist — one
     reversible flag flip). The champion's 2026 record stays as history.
   - Doesn't → champion stays; the honest "didn't beat it" is itself a clean finding.

The infra already exists: `packages/models/registry.py` (`register_model_version`, `promote`,
`get_production_version`), `metrics_snapshot` evidence scopes, the monthly `train.yml` (which
already produces a *retrain* challenger — the xG one is a new-*recipe* challenger).

## Timing
- **Do NOT rush it in before 2026-07-16.** It can't be the official 2026 model anyway
  (unvalidated), it's not a safe 2-day build to the quality bar, and rushing risks a leakage bug
  that would poison the one clean 2026 test.
- **Starting the isolated build now is fine** and freezing *before the season starts* gives the
  cleanest possible full-season test — but **build it right, not fast**; freeze it whenever it's
  clean. Even a late-July/August freeze barely dents the window (MLS runs to October + playoffs).
- **The launch always wins** if anything in M9/M10 needs attention.

## First concrete step
An **xG data spike** (GO/NO-GO, like the E2/E3 spikes): confirm Understat (or FBref) has clean
MLS xG for 2017–2025 and that its team names reconcile to our canonical teams — *before* building
any rating engine on it.

## Build outline (once GO)
- Understat/FBref scraper + historical MLS xG backfill; team-identity reconciliation (expect the
  same aliasing work as Highlightly/SGO).
- An xG-based rating engine (mirror `packages/features/elo.py`, fed by xG instead of goals; or an
  attack/defense strength model), producing a leakage-safe `xg_*_diff`-style feature.
- Wire it into a **fs-v2** feature set; keep fs-v1 untouched (the champion uses it).
- Re-run the walk-forward selection with fs-v2 as a candidate; the **leakage suite (T-064) must
  still pass**.
- For live shadow: an xG ingestion job in the job container (Understat after each match).

## Related follow-ups already logged (BUILD_LOG)
CORS tighten to the CloudFront origin; populate the `elo_rating` table via the grade job (cheap
per-team history); live market aggregates inside `recompute_live_snapshot`.
