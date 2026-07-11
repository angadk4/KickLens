# Spike (T-007) — Neon pooled connection strategy

**Date:** 2026-07-11 · **Verdict: GO (closes the BL-6 database half).**

Target: the production Neon project (`neondb`, **PostgreSQL 18.4**, `us-east-1`,
**pooled `-pooler` endpoint**, `sslmode=require&channel_binding=require`), reached over the
public internet from a no-VPC context — exactly the deployed Lambda's network position.

## Results (real measurements)

| Test | AC | Measured |
|---|---|---|
| Burst: 30 concurrent connect+query | no "too many clients" | **30/30 OK, 0 errors**, 0.34s total wall; per-conn min 0.27 / median 0.31 / max 0.34s |
| Sequential churn ×20 (job cadence) | stable | median 0.22s, max 0.23s |
| Cold wake after ~7 min idle (autosuspend fired) | **< 2s** | **1.78s** first connect; 0.23s warm follow-up |

## Decisions confirmed

- **Pooled (PgBouncer transaction-mode) endpoint works from no-VPC** at burst levels far above
  our real concurrency (hourly jobs + a low-traffic API). Supabase fallback not needed.
- Cold wake (1.78s) fits inside every frozen job timeout (300s ingest/grade, 120s inference,
  29s API) — worst case an API request pays ~2s once after idle.
- Local dev stack aligned to **postgres:18** (same 18.4 minor) for dev==prod parity; the PG18
  image's new volume convention (`/var/lib/postgresql` mount) captured in compose.

## Remaining BL-6 item

Only the **deployed** Lambda cold-start measurement (T-006b) — collected as part of T-221
verification once the container is on ECR. Local evidence (1.33 GB image, 1.08s import) plus
this spike leave no credible path to the >10s fail-stop.
