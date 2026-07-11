# ADR-002 — Infrastructure & architecture decisions (frozen)

**Date:** 2026-07-11 · **Status: Accepted** — these were frozen in Build Contract v2.1 §8 before
the build; this ADR records the rationale in one place per T-251. None may change without a
Contract version bump.

## Neon serverless Postgres (not RDS)
Always-free tier, scale-to-zero (matches our bursty hourly-job + low-traffic-API load), branch
previews. RDS would carry a standing hourly cost against the $0–3/mo target. Emergency fallback:
Supabase (also pooled Postgres). **Verified (spike T-007):** pooled endpoint handles 30-way
bursts with 0 errors; cold wake 1.78s. Production runs **PostgreSQL 18.4**; local dev matches.

## Lambda outside any VPC + Neon pooled (PgBouncer) transaction-mode endpoint
A VPC-attached Lambda would need a NAT gateway (~$32/mo — blows the budget) to reach Neon over
the internet. Running Lambda outside any VPC and connecting to Neon's **pooled** endpoint avoids
NAT entirely and prevents connection exhaustion under concurrent invokes. Deployed cold starts
(T-006b): 4.0–6.8s, well under the 10s fail-stop.

## Choreography, not Step Functions
EventBridge schedules + DB state-gating + idempotency keys + Postgres advisory locks. For a
handful of independent hourly jobs this is $0 and simpler than an orchestrator; each job is
idempotent and safe to re-run or fire out of order (proven by the finalization/inference tests).

## One job container image (multi-handler) + one slim API zip
The ML stack (sklearn/lightgbm/statsmodels ≈ 1.33 GB image) is isolated in a single
multi-handler container (CMD per function); the public API is a separate **8.1 MB zip with no ML
libraries** so it stays fast and cheap. Splitting them keeps the API cold start tiny.

## S3 + CloudFront (frontend), API Gateway HTTP API, SSM Parameter Store
Static site on S3 behind CloudFront (OAC, no public bucket). HTTP API (not REST API) — cheaper,
enough for GET-only. Secrets in **SSM Parameter Store SecureStrings** (free) rather than Secrets
Manager ($0.40/secret/mo). Region **us-east-1**.
