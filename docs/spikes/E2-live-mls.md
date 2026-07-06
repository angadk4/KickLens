# Spike E2 (T-002) — Does a free tier return the current 2026 MLS season?

**Date:** 2026-07-06 · **Verdict: GO (BL-1) via the documented fallback.** API-Football free
tier = NO-GO for the current season; **Highlightly free (BASIC) tier = GO** and is adopted as
the **live primary**.

## Fallback result — Highlightly (tested 2026-07-06, key on BASIC/free tier)

- Host `https://soccer.highlightly.net`, auth header **`x-rapidapi-key`** (`x-api-key` is
  rejected; requests also need a browser-like `User-Agent` — Cloudflare blocks the Python
  default with error 1010). Plan message: *"All data available with current plan."*
- **MLS = league id 216087**, seasons 2020–2026 listed.
- **Current-season data confirmed** (raw payloads in `data/raw/spikes/e2/highlightly_*.json`):
  - Finished 2026 matches with final scores + round labels, e.g. 2026-05-23:
    FC Cincinnati 6–2 Orlando City, DC United 4–4 Montréal Impact, Charlotte 1–0 New England,
    Minnesota 1–1 Real Salt Lake, St. Louis City 3–0 Austin (`Regular Season - 16`).
  - Upcoming post-World-Cup-break fixtures: 2026-07-18 (2 matches incl. LA Galaxy vs LAFC,
    `Regular Season - 17`) and 2026-07-25 (8 matches, `Regular Season - 19`) with UTC kickoffs
    and stable match ids. (Early-July dates return 0 matches — the league is on the World Cup
    break, as expected; resumption ~July 16.)
- **Acceptance test passed:** all five finished scores cross-checked against the independent
  source (`USA.csv` 2026 rows) — **exact match on every score**.
- **Rate limit:** `X-Ratelimit-Requests-Limit: 100`/day (remaining header present per call).
  Ample for the ops cadence (fixtures ingest 2×/day ≈ 2–6 calls; odds come from a different
  provider).
- Team ids captured for 10 teams from one date's payloads (e.g. FC Cincinnati=1908726,
  DC United=1375149); the full map builds out in T-031/T-040 as dates are ingested. **Naming
  quirk: Highlightly uses "Montréal Impact" (pre-2021 name) and "Austin"/"St. Louis City SC"
  variants — the T-005/T-040 alias map is confirmed necessary.**

## Bonus methodological finding (feeds T-030 ingestion)

Comparing Highlightly's true-UTC kickoffs against `USA.csv` (e.g. 23:30Z vs file "24/05/2026
00:30") shows the historical file's Date/Time is **UK-local (BST in summer), not UTC** — a
1-hour refinement of E1's "+1 day shift" observation. Ingestion must parse file datetimes as
Europe/London and convert to UTC (`kickoff_approx=true` regardless). The R1 playoff filter is
unaffected (its ≥2-day boundary gaps dwarf a 1-hour offset).

## What was tested (real API responses; raw payloads in `data/raw/spikes/e2/`)

Key registered by developer on the API-Football **Free** plan (`v3.football.api-sports.io`).

1. `/status` → plan **Free**, 100 requests/day (`x-ratelimit-requests-limit: 100`,
   per-minute limit 10).
2. `/leagues?id=253` → **MLS = league id 253** (USA). Seasons list includes 2023–2026 with
   `current=true` on 2026 and full fixtures/events coverage flags. So the *metadata* advertises
   the current season…
3. `/fixtures?league=253&season=2026` → **0 results** with the explicit error:
   > `{'plan': 'Free plans do not have access to this season, try from 2022 to 2024.'}`
4. `/teams?league=253&season=2026` → same plan error. Season **2025 is likewise excluded**
   (free window = seasons 2022–2024 only).

## Verdict on the primary

**NO-GO for the live loop on API-Football's free tier.** The free plan is a historical-seasons
window (2022–2024); the current season — the only thing the live loop needs — is paywalled.
This is exactly the failure mode the Contract anticipated (Dependency Verification: "assumed,
unverified"); its designated fallback is **Highlightly (free)**.

## What the free tier still yielded (kept)

- **Team-id map, season 2024 (29 teams)** — saved to `data/raw/spikes/e2/teams_2024.json` and
  usable for T-005 alias drafting (ids are stable across seasons). Note for reconciliation:
  API names differ from football-data.co.uk names in predictable ways ("Atlanta United FC" vs
  "Atlanta Utd", "Austin" vs "Austin FC", "Los Angeles Galaxy" vs "LA Galaxy" spelling variants
  to be checked). **San Diego FC (joined 2025) is not in the 2024 list** — its id needs the
  fallback provider or a paid season.
- MLS league id (253) and coverage flags confirmed.

## Decision

**Adopt the documented fallback: Highlightly = live primary for current-season fixtures/results**
(fallback adoption pre-authorized by Contract §5 / Dependency Verification §2.9 — updated there).
API-Football remains a free historical (2022–2024) cross-check source only; its 2024 team-id map
(29 teams, `teams_2024.json`) still feeds T-005. Round-label cross-check of the R1 filter can run
against Highlightly's `Regular Season - N` labels during T-031.

## Test (per ticket spec)

"A finalized fixture's score matches an independent source" — **PASSED**: five 2026-05-23
Highlightly finished scores all match `USA.csv` exactly (6–2, 4–4, 1–0, 1–1, 3–0).
