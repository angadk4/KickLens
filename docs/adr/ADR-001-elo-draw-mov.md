# ADR-001 — Draws move Elo ratings (MOV multiplier G=1 at gd=0)

**Date:** 2026-07-06 · **Status: Accepted** (developer-approved 2026-07-06, amending a frozen
Build Contract §6.1 value) · **Supersedes:** the literal reading of the frozen MOV formula.

## Context

Build Contract v2.1 §6.1 froze the Elo update as `R' = R + K·G·(S−E)` with MOV multiplier
`G = ln(|gd|+1) · 2.2/((Δelo)·0.001+2.2)`. Taken literally, `gd=0 ⇒ ln(1)=0 ⇒ G=0`: **draws
(~25% of MLS matches) would produce zero rating movement**, discarding real information (a draw
against a stronger side is evidence of strength; S−E ≠ 0 whenever E ≠ 0.5). Implemented
literally in T-060 and flagged at the 2026-07-06 checkpoint; the developer approved the change
before any M3 modeling consumed `elo_diff`.

## Decision

For **decisive matches** the frozen formula is unchanged:
`G = ln(|gd|+1) · 2.2/((Δelo_winner)·0.001 + 2.2)`.
For **draws (gd=0): G = 1.0** — the surprise term `(S−E)` alone scales the update; the MOV
damping term exists to counteract blowout autocorrelation, which has no analogue in a draw.
This matches standard practice (e.g. World Football Elo Ratings use G=1 for margins ≤ 1).

## Consequences

- `packages/features/elo.py` updated; the draw unit test now asserts movement toward the
  underdog and zero-sum symmetry.
- All fs-v1 rows rebuilt (elo_diff and inputs_hash change); leakage suite re-run green.
- Build Contract §6.1 MOV cell annotated in place with a pointer to this ADR. Any Contract
  version bump (v2.1 → v2.2) and file rename is the developer's call per CLAUDE.md §8.
- No other frozen value touched. Walk-forward refits mean no other artifact needed invalidation
  (nothing downstream of Elo existed yet — that was the point of deciding now).
