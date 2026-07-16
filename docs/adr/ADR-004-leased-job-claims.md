# ADR-004 — Leased job claims replace advisory locks (choreography mechanism)

**Date:** 2026-07-16 · **Status: Accepted** (documents a launch-review decision implemented
2026-07-13 and recorded in the build log; annotates frozen Build Contract §8) ·
**Supersedes:** the "Postgres advisory locks" mechanism named in Contract §8/A20.

## Context

Build Contract v2.1 froze job orchestration as "Choreography — EventBridge + DB state-gating
+ idempotency keys + **Postgres advisory locks**; no Step Functions." The frozen DB choice is
Neon's **pooled (PgBouncer, transaction-mode)** endpoint — and session advisory locks are void
behind transaction pooling: the lock releases the moment the transaction ends, which is exactly
when it is still needed. The two frozen choices were mutually incompatible; one had to move,
and the DB/pooling choice is the load-bearing one (ADR-002).

## Decision

Production uses **leased, hour-bucketed job claims** in the `job_run` table instead of
advisory locks (`packages/common/db.py: claim_job`, lease `CLAIM_LEASE_MINUTES = 15`):

- a duplicate EventBridge delivery finds a live claim for the same key and no-ops;
- a crashed run's claim expires with its lease, so the next scheduled run reclaims it;
- claim keys are deterministic (`ingest:{YYYYMMDDTHH}`, `finalize:{match_id}:rev{N}:{cutoff}`),
  which also gives idempotency a durable audit trail.

Everything else in §8's orchestration row is unchanged (choreography, EventBridge,
state-gating, idempotency keys, no Step Functions). The advisory-lock helper survives only
for local single-connection tooling.

## Consequences

- Contract §8 (A20, §8 table, §12 diagram note) carries in-place annotations pointing here,
  ADR-001-style; the frozen intent (no double-runs, crash-safe scheduling) is preserved by a
  mechanism that actually works behind PgBouncer.
- Tested by the launch-review suite (duplicate-delivery no-op, lease-expiry reclaim).
