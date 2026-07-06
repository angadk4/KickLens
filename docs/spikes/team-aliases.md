# Spike (T-005) — Team-name reconciliation dry-run

**Date:** 2026-07-06 · **Verdict: GO — clean.** 51 aliases drafted across both live providers,
**0 unresolved provider names**, 1 canonical team awaiting a provider id (San Diego FC).

Draft (machine-readable, consumed by T-040): `packages/ingestion/resources/team_aliases_draft.json`.

## Method

- **Canonical names = `USA.csv` names** (the historical base): 30 distinct teams appear in
  2017–2026 (San Diego FC joined 2025).
- Provider sources reconciled: **API-Football** 2024 team-id map (29 teams) and **Highlightly**
  ids observed in the E2 match payloads (22 teams so far).
- Matching: accent/punctuation-normalized comparison with FC/SC/CF suffix stripping and
  `Utd→United`, plus a small curated variant map. Every mapping was reviewed by eye (output in
  BUILD_LOG / the JSON).

## Findings

- **All 51 provider names resolved.** Systematic variants: providers append `FC`/`SC`
  ("Atlanta United FC", "Orlando City SC", "New York City FC"); file uses "Atlanta Utd";
  provider "Austin" ↔ file "Austin FC"; "St. Louis City SC" ↔ "St. Louis City".
- **One true rename:** Highlightly still uses **"Montréal Impact"** (pre-2021 name) for
  **CF Montreal** — exactly the silent-bug class this spike exists to catch; curated mapping, not
  string similarity, handles it.
- **San Diego FC** (2025 expansion): no provider id yet — not in API-Football's free 2022–2024
  window, and not in the Highlightly dates sampled. Its id resolves automatically at first
  ingested SD match date (T-031); listed under `canonical_without_provider_id` so T-040's
  coverage test fails loudly if it doesn't.
- **Defunct clubs (e.g. Chivas USA, folded 2014):** not present in the 2017+ era — irrelevant to
  MVP; matters only if the post-MVP 2012–2016 sensitivity check is run.

## Ticket test

"Every 2017–2025 match's two teams map or appear on the unresolved list" — **PASS** (verified
programmatically over all era rows).

## Handoff to T-040

Seed `team` + `team_alias` from the draft; enforce: every alias unique per (provider,
provider_key); unresolved coverage must be zero before historical ingestion completes; add
Highlightly ids opportunistically as match payloads arrive (incl. San Diego FC).
