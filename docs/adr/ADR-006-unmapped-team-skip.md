# ADR-006 — An unmapped provider team skips its fixture, it no longer halts the sweep

**Date:** 2026-07-25 · **Status: Accepted** (incident-driven; developer-approved 2026-07-25) ·
**Refines:** the T-040 alias fail-stop ("Unresolved names BLOCK ingestion (fail loudly)").

## Context

**The incident.** From **08:01 UTC 2026-07-23** (last good full sweep: 2026-07-22 20:00 UTC)
every full ingest sweep died with:

```
UnresolvedTeamError: no team_alias for provider='highlightly' key='15033699'
```

One club in the provider's feed had no alias — plausibly a cup / all-star / expansion opponent
that the MLS league feed started carrying. The T-040 fail-stop raised, which aborted the whole
sweep, so for **~60 hours across 6 consecutive failed full sweeps nothing was ingested**: no new
fixtures, no kickoff moves, no supersession. The fixture horizon froze at what the 2026-07-22
20:00 sweep had seen (its +7d reach ended 2026-07-29), so fixtures from 2026-07-30 onward were
never ingested at all. Freezes and grading of already-known matches were unaffected, and — by
luck, not design — the ADR-005 night results-only sweeps survived, because they skip non-final
fixtures *before* team resolution; those narrow sweeps also kept `/health` reporting
`freshness_ok: true` for the entire outage (fixed separately: `/health` now tracks the full
sweep via `last_full_ingest` / `schedule_fresh`).

Two properties were in tension:

- **T-040's guarantee (must keep):** never *guess* a team. A wrong alias silently corrupts the
  match identity, the Elo ratings, and therefore the record.
- **Blast radius (was wrong):** one unmappable fixture must not take down ingestion for every
  other fixture. Halting protects nothing — the other fixtures are perfectly resolvable — while
  actively harming the record by starving it of results.

The fail-stop was written for the **historical loader**, where an unknown name means the dataset
is wrong and stopping is right. In the **live loop** the same rule has a very different cost.

## Decision

A fixture whose teams cannot be resolved is **skipped**; the sweep continues.

1. **Never guess (unchanged).** The skipped fixture gets **no match row and no `source_fixture`
   row** — resolution happens before any write, so a skip leaves nothing partial behind.
2. **Never silent.** The skip is reported three ways: counted in `stats['unresolved']`, printed
   to CloudWatch with the club's **name** (see 4), and persisted to `job_run.details` →
   `{"unresolved_teams": [...]}` on the otherwise-successful run.
3. **Surfaced daily, not hourly.** The canary (09:00 UTC) reads the latest ingest run's
   `details` and **raises** — the existing alarm path — while unresolved fixtures remain. This
   notifies without paging every hour, and it stays lit until an alias is added or the fixture
   leaves the window.
4. **Self-diagnosing.** `LiveFixture` now carries the provider's display names
   (`home_label` / `away_label`, **diagnostics only — never used to resolve a team**), so the
   message reads `Some Cup FC [15033699] v …` instead of a bare id needing a manual API lookup.
5. **Self-healing.** Because nothing is persisted for a skipped fixture, the next sweep retries
   it: adding the alias is the entire fix, with no backfill step.
6. **The run is `done`, not `failed`.** The sweep did successfully poll, so `/health` freshness
   stays honest. (Marking it failed would have made `last_ingest` stall and the site show a
   false "stale data" banner while data was in fact flowing.)

The `ingest` handler still raises — and alarms — when **every** day of the sweep fails
(total provider outage). That guard is unchanged.

## Consequences

- A cup/all-star/expansion fixture no longer costs a day of ingestion; it costs that one row.
- The operator's action is unchanged and now obvious from the log line: add the alias, **or**
  exclude the fixture if it is not regular season.
- **Related gap this exposed (not fixed here):** `is_regular_season(2026, …)` returns `True` for
  every date because 2026 has no `decision_day` configured, so a non-regular-season fixture
  would be stored as regular season *if* someone added an alias for it. The 2020 MLS-is-Back
  precedent handles exactly this with `extra_exclusion_windows`. **Before adding an alias for an
  unknown club, confirm the fixture is regular season** — otherwise add an exclusion window.
- Trade-off accepted: a genuinely mis-keyed *MLS* team is now skipped quietly-ish (daily canary)
  rather than loudly (hourly alarm). The canary + the log line + `job_run.details` are judged
  sufficient, and the alternative starves the record.
