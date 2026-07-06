# Spike E3 (T-003) — Free MLS three-way odds feed + display ToS

**Date:** 2026-07-06 · **Verdict: GO (BL-2) — live same-cutoff market comparison is IN.**
Provider: **SportsGameOdds (SGO)**; capture cadence per Contract §9 (hourly, fixtures with
kickoff ∈ [now+2h, now+4h]); display **aggregate/derived only** (see ToS section).

## Data findings (real payloads in `data/raw/spikes/e3/`)

- API `api.sportsgameodds.com/v2`, auth header `X-Api-Key` (+ a browser-like `User-Agent`;
  Cloudflare rejects Python's default UA). Soccer leagues on this tier: **MLS** + UCL.
- `/v2/events/?leagueID=MLS&oddsAvailable=true` returned live-odds events **10 days before
  kickoff**, including resumption day: **CF Montréal vs Toronto FC, 2026-07-16T23:30Z** with a
  **full three-way regulation market**:
  - `points-home-reg-ml3way-home`: bookOdds −126 (fairOdds −109)
  - `points-all-reg-ml3way-draw`: bookOdds +272 (fairOdds +301)
  - `points-away-reg-ml3way-away`: bookOdds +280 (fairOdds +308)
- **Draw price present; per-bookmaker prices carry `lastUpdatedAt` timestamps** (e.g. fanduel
  2026-07-06T03:37:07Z, williamhill 2026-07-06T03:36:51Z) and `available` flags — the ticket's
  timestamp requirement is met. `started/ended` flags support pre-kickoff capture discipline.
- Sanity: de-vigged `fairOdds` implied probabilities sum to ≈1.016 (H 0.522 / D 0.249 / A 0.245);
  consensus `bookOdds` overround ≈1.089 — plausible market prices. Odds are American format →
  ingestion converts to decimal/probabilities.
- **Rate limits (from `/v2/account/usage`, tier "amateur"):** 10 req/min (binding), 50,000/hour,
  500,000/day; entity caps 250k/hour, 3M/day. The frozen hourly odds cadence uses ~1–5 req/hour —
  orders of magnitude inside limits.

## ToS finding (aggregate display)

From the SGO Terms of Service (fetched 2026-07-06):

- **Forbidden:** redistribution/republication of Data ("data dumps, database access,
  downloadable files, bulk exports"), reselling, or providing raw odds as a standalone offering.
- **Explicitly permitted:** retaining "outputs that are **fully transformed or aggregated** such
  that they cannot be used to reconstruct the Data or serve as a substitute for it."
- Attribution: only required if provider attribution ships with the data; "powered by
  SportsGameOdds" is permissible factually.

**Decision (matches the Contract's frozen aggregate-only rule):** the dashboard may show
(a) **aggregate market-vs-model performance metrics** (log loss comparisons, calibration) —
clearly permitted; and (b) **per-match de-vigged consensus implied probabilities** at the cutoff
(never raw prices, never per-bookmaker quotes, never odds-format data). **Honest caveat:**
(b) is the closest thing to the line — a per-match consensus probability is transformed
(de-vigged, aggregated across books, probability-space) but per-event. If this is ever
challenged, the pre-planned fallback is dropping (b) and keeping (a) — the scientific value
(the market benchmark) lives in the DB either way, unaffected. KickLens is non-commercial,
relevant to the free-tier terms.

## Ticket test

"Sample payload contains three outcomes with a timestamp" — **PASSED** (home/draw/away with
per-bookmaker `lastUpdatedAt`, saved in `events_oddsavail.json`).

## Notes for T-111/T-142 (live capture tickets)

- Event ids are SGO-native (`eventID: dMpdNInZS7sZKjfVZLJ2`) — the alias/reconciliation layer
  must map SGO team names ("CF Montréal" style) alongside Highlightly's.
- Store snapshots in `market_snapshot` with `capture_time_utc = fetch time` and keep the raw
  payload ref; `is_closing=false` for live captures.
- Odds may firm up closer to kickoff (2 books today, likely more at T-3h in-season); capture at
  T-3h per the frozen cutoff regardless of book count, recording the count.
