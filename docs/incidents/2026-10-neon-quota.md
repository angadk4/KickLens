# Incident: production database suspended by the Neon free-plan quota

**Window:** 2026-10-26 ~12:00 UTC to 2026-10-27 19:08 UTC (about 31 hours) · **Status:** resolved ·
**Official forecasts missed:** none · **Record:** unchanged

## Summary

The production database (Neon Postgres, free plan) exceeded its monthly quota, and Neon
suspended it. For about 31 hours every job that reads or writes the database failed, and the
public API returned HTTP 500, so kicklens.app loaded with every data section empty.

No official forecast was missed and nothing in the record changed, because the outage fell
between matchdays. The last round (2026-10-25) had been frozen, anchored and graded before the
suspension, and the next kickoff was 2026-10-28 23:30 UTC. Service was restored by moving the
project to Neon's usage-based Launch plan.

## What happened

Neon's free plan caps a project at 100 compute-hours, 0.5 GB of storage and 5 GB of network
transfer a month, and exceeding any of them suspends compute until the next billing month. From
2026-10-26 ~12:00 UTC every connection was refused with:

```
ERROR:  Your account or project has exceeded the quota. Upgrade your plan to increase limits.
```

The last healthy canary ran at 09:00 UTC that day with every check at zero, and the last good
inference run was at 11:20 UTC. The first failure was the 12:00 UTC Merkle seal.

Which limit tripped is not yet confirmed; Neon's Usage page shows it. Compute hours is the
likely one. The job schedule wakes the database at :05, :10 and :20 every hour, at :35 every
second hour, and hourly from 01:00 to 06:00 UTC for results. With a five-minute autosuspend, that
keeps it running about a third of every hour, all month. October also carried the monthly
training load (Oct 1) and the duplicate-match investigation and repair
([2026-10-duplicate-live-matches](2026-10-duplicate-live-matches.md), Oct 4-5).

## Impact

- **Public API:** HTTP 500 on every data endpoint for about 31 hours. The static site stayed up.
- **Jobs:** ingest, feature, inference, grading and the daily Merkle seal all failed. No data was
  lost; each job resumed on its next scheduled run.
- **Official forecasts:** none missed. No regular-season match kicked off between the last
  forecast frozen before the outage and the restore: the last graded kickoff was 2026-10-26
  01:00 UTC, and the next is 2026-10-28 23:30 UTC. The canary after the restore reported
  `missed_forecasts: 0` and `overdue_results: 0`.
- **Record and anchors:** untouched.
- **Alerting:** 89 alarm emails, one per failed job run, because the job alarms reset five
  minutes after each failure. The API's own error alarm never fired, because FastAPI answers 500
  without the Lambda function itself erroring. The site was broken for 31 hours with no alarm that
  said so directly.

## Resolution

At about 19:05 UTC on 2026-10-27 the project moved to Neon's Launch plan (pay-as-you-go, no
minimum). The database answered immediately:

- `/health` returned 200, and the canary was green with every check at zero.
- All 14 CloudWatch alarms were back to OK.
- The first scheduled runs afterwards succeeded (feature 19:10 UTC, inference 19:20 UTC).

## Follow-ups (proposed, not yet made)

- **Let the database sleep more.** Run the odds, feature and inference jobs back to back in one
  window. Call the odds API only when a match is near. Add an off-season mode after Decision Day
  (2026-11-07), so empty hourly runs stop waking it for months.
- **Alarm on API Gateway 5xx responses,** not only on Lambda errors.
- **Send one email when an outage starts and one when it ends,** instead of one per failed run.
- **Choose the plan after November 1:** stay on Launch, or return to Free once wake time is down.
