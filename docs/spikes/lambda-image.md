# Spike (T-006) — Lambda ML dependency image size

**Date:** 2026-07-05 · **Status: local half GO; cloud half blocked on AWS account (BL-6 still open)**

Buildable spike artifact: `infra/spikes/lambda-image/` (Dockerfile + pinned requirements + no-op handler).

## Question

Does the full ML job stack (scikit-learn + lightgbm + statsmodels + pandas + numpy + scipy +
psycopg) fit the Lambda **container image limit (10 GB)**, and is cold start acceptable (<10 s)?

## Local measurements (real output)

- Base image: `public.ecr.aws/lambda/python:3.12` (official AWS Lambda AL2023 base).
- **Image size: 1.33 GB — 13% of the 10 GB limit.** Massive headroom; adding model artifacts and
  app code will not approach the limit.
- Handler invoked through the image's built-in Lambda runtime emulator:
  `{"statusCode": 200, "import_seconds": 1.083, "versions": {"sklearn": "1.9.0", "lightgbm":
  "4.6.0", "statsmodels": "0.14.6", "pandas": "3.0.3", "numpy": "2.5.1", "scipy": "1.18.0",
  "psycopg": "3.3.4"}}` — first local invoke wall time 1.18 s.

## Finding that would have broken the deploy

**lightgbm requires `libgomp.so.1` (OpenMP runtime), which the AL2023 Lambda base image does NOT
ship.** Without `RUN dnf install -y libgomp` the import fails at runtime with
`OSError: libgomp.so.1: cannot open shared object file`. The fix is in the spike Dockerfile and
must be carried into the production job image (T-221).

## Remaining (blocked on developer: AWS account + credentials)

- Push to ECR, deploy the no-op handler, measure **real** cold start (target <10 s). Local import
  time of 1.08 s on a 1.33 GB image projects comfortably under that, but the projection is not the
  measurement — BL-6 closes only with the deployed number (together with T-007 Neon).

## Verdict

- Size gate: **GO** (1.33 GB « 10 GB).
- Cold-start gate: **pending AWS** — no PaaS fallback needed on current evidence.
