# ADR-005 — Results-only night-window ingest (operational cadence amendment)

**Date:** 2026-07-23 · **Status: Accepted** (developer-approved 2026-07-23 during the
matchday-state audit; annotates frozen Build Contract §9) · **Amends:** the "Ingest
fixtures/results — EventBridge, 08:00 and 20:00 UTC daily" cadence row.

## Context

Contract §9 froze results ingestion at 08:00 + 20:00 UTC daily. MLS kickoffs are evening-US
(~23:00–03:00 UTC), so finals land ~01:00–05:00 UTC — entirely inside the 20:00→08:00 gap.
Consequence: a finished match sat in the DB as `status='scheduled'`, `result=null` for
**4–13 hours**, the graded record stalled overnight, and the dashboard could not distinguish
a live game from a finished one (it labelled finished games "in play" — the defect that
triggered the 2026-07-23 audit). The frontend fix (the `matchPhase` inference model) makes
the UI honest regardless of lag; this ADR shortens the lag itself.

## Decision

Add an EventBridge rule `ingest-results-night`: **hourly at 01:00–06:00 UTC**, invoking the
SAME ingest handler with `{"results_only": true}`, which:

1. narrows the day-offset sweep from (−1..+7) to **(−1, 0)** — yesterday + today, the only
   days carrying just-finished finals;
2. processes **completed finals ONLY** (result + status + the audit revision) and **never
   runs supersession/voids or kickoff updates** — the night window overlaps live play, where
   a transient provider blip (kickoff-time wobble, a momentary 'postponed') must not void a
   frozen official mid-game. Voids/supersession remain the 08:00/20:00 full sweeps' job,
   which never coincide with MLS play — the pre-launch supersession semantics and their
   exposure are exactly preserved;
3. skips the per-day HTTP retry ladder (`retry_delays=()`): the next hourly run IS the retry.

The 08:00/20:00 full sweeps remain the authoritative fixture-horizon ingests, unchanged.

## Consequences

- Finished→graded latency drops from up-to-13h to **≤ ~2h** (next `:35` grade run after the
  hourly result lands); the public record accrues overnight on matchdays.
- **Provider budget:** 6 runs × 2 calls = 12/day extra → **~30/day total vs the 100/day**
  Highlightly free-tier cap (70% headroom). Variant reusing the full 9-day sweep (~72/day)
  was rejected as too close to the cap. Worst-case amplification is bounded by design: the
  night runs carry **no HTTP retries** (a failed hour is simply retried by the next hour's
  run), so a fully-down provider adds at most 12 failed calls, and EventBridge's async
  re-delivery is absorbed by the hour-bucket claim (a duplicate delivery no-ops).
- **Live-window safety (the one downstream behavior the cadence DOES touch):** sampling the
  01:00–06:00 window means observing games mid-play. The finals-only narrowing above is the
  guard — a night run cannot void, cannot move a kickoff, and writes nothing for a fixture
  that isn't a completed final. Without it, a single transient provider blip observed by any
  of the 6 nightly samples could have voided a frozen official during play.
- **AWS budget:** EventBridge rules are free; ~6 extra Lambda invocations/day are negligible;
  Lambda runs outside any VPC (no NAT). The only marginal cost is a handful of extra Neon
  scale-to-zero wakes inside a bounded night window.
- The total-outage guard generalizes from `== 9` failed days to `== len(offsets)` so a full
  provider outage still fires the Errors alarm in the narrowed sweep.
- Hour buckets 01–06 never collide with the 08:00/20:00 claims; duplicate deliveries no-op.

## Alternatives considered

- **Do nothing (frontend-only honesty):** shipped as well, but leaves the record stale
  overnight — the developer explicitly chose "honest + fresher."
- **Full-sweep night runs:** rejected — ~72 provider calls/day risks the free-tier cap.
- **Provider webhooks / live polling during matches:** out of scope for the free tier and
  unnecessary; hourly result sync is enough for a T-3h-frozen, post-hoc-graded product.
