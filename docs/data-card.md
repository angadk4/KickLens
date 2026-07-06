# Data card — KickLens

## Sources

| Role | Source | Access | Notes |
|---|---|---|---|
| Historical results + closing odds (2012→current) | football-data.co.uk `new/USA.csv` | free download, cached locally, SHA-256 snapshotted | source of truth for prior complete seasons |
| Live fixtures/results (current season) | Highlightly (league 216087) | free tier, 100 req/day | adopted primary after the pre-registered API-Football fallback triggered (free plan excludes current seasons) |
| Live 3-way odds near cutoff | SportsGameOdds | free tier | aggregate/derived display only per ToS; raw prices never republished |

## Coverage & filters (all verified programmatically; spikes in `docs/spikes/`)

- **Regular season only.** Playoffs ARE present in the historical file and are excluded by the
  R1 date-window rule (Decision Day + 1 day; 2020 MLS-is-Back knockout window). Verified by the
  34-games-per-team invariant for every season 2012–2025 except COVID-2020, and by all nine
  known MLS Cup finals being excluded.
- **Era:** dev 2017–2024 (3,386 matches, 842 draws) · touch-once test 2025 (510) · live 2026+.
  2012–2016 retained only for a post-MVP sensitivity check.
- **Odds:** Pinnacle closing covers 3,895/3,896 era matches (99.97%); market-average fallback
  for the single gap; overrounds 1.012–1.064 (sane). Closing-only — no historical odds
  timestamps exist, hence the market comparison is a stronger-information reference.

## Known quirks (each handled + tested)

1. **Timestamps are UK-local**, not UTC — proven by cross-checking live-API UTC kickoffs
   (1-hour offset in summer, +1 day for US evening kickoffs). Parsed as Europe/London →
   converted to UTC; historical kickoffs flagged approximate.
2. **Dirty cells exist**: a literal `x` in one odds column; two implausible market-average
   overrounds (0.953, 1.471). Implausible odds groups are dropped (match kept, market subset
   only shrinks); genuinely malformed rows quarantine with reasons; >5% batch rejects halt.
3. **Team identity is treated as the top silent-failure risk**: curated alias map across all
   providers (e.g. Highlightly still uses "Montréal Impact" for CF Montreal); unresolved names
   hard-stop ingestion; Chivas USA (defunct 2014) exists pre-era only.
4. **2020 (COVID)** is irregular: shortened uneven schedules (18–23 games), MLS-is-Back group
   stage kept (counted toward the regular season, tagged neutral-site), knockouts excluded.
5. **In-season gaps are real, not data holes**: 2020 COVID (122d), 2023/24 Leagues Cup
   (36/34d), 2026 World Cup break; the DQ suite flags gaps for review rather than failing.

## Processing guarantees

Raw downloads content-addressed with SHA-256 → validation gates + quarantine → canonical
tables → point-in-time fs-v1 features (leakage suite R1–R8: recompute parity over every stored
row, tamper tests, schedule-only assertions) → dataset snapshots pinned per training run.
Every provider fixture change is an append-only revision; a postponement never creates a new
match identity. All timestamps stored UTC.

## Licensing / display

football-data.co.uk data used with attribution as a free public source; live odds displayed
only as transformed aggregates (de-vigged probabilities / performance metrics) per provider
ToS; no bulk redistribution of any provider's raw data.
