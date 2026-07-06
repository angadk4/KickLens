# fs-v1 feature registry (T-060–T-063)

Engine: `packages/features/` (`elo.py`, `engine.py`, `builder.py`). Contract §6.1 is the frozen
source; this registry records the exact emitted keys and the two documented interpretations.

**Point-in-time guarantee (structural):** matches are walked chronologically and each match's
row is emitted *before* its result enters any state; cutoff = kickoff − 3h. Only regular-season
matches are walked; non-RS matches never contribute and never get rows. Proven by the T-064
suite (below).

## Emitted keys (per match, as of T-3h)

| Key | Definition | Fill-in |
|---|---|---|
| `elo_diff` | pre-match `elo_home − elo_away` (K=20, H=60 in expectation, MOV multiplier, 0.75 season regression, R₀=1500, RS-only) | new team 1500 |
| `form5_pts_{home,away}`, `form10_pts_{home,away}` | mean PPG over the team's last 5/10 RS matches before cutoff | n<k uses n; n=0 → 1.35 |
| `form5_gd_{home,away}`, `form10_gd_{home,away}` | mean goal diff over last 5/10 | n=0 → 0.0 |
| `home_form5_pts` / `away_form5_pts` | home team's last 5 **home** / away team's last 5 **away** RS matches PPG | 1.35 |
| `rest_days_{home,away}` | cutoff date − last RS match date; cap 14 | no prior → 7 |
| `congestion_{home,away}` | RS matches in [cutoff−14d, cutoff) | 0 |
| `season_progress` | scheduled season matches before this one ÷ total scheduled (schedule-derived, result-independent) | — |
| `cold_start_{home,away}` | 1 if team has <10 prior RS matches in dataset | — |
| `neutral_site` | 1 for known neutral venues (2020 MIB group stage, 36 matches, tagged at ingestion) | 0 |

`inputs_hash` = SHA-256 of canonical JSON (match_id, cutoff, features, version) — the
recompute-parity anchor.

## Documented interpretations of the frozen table

1. **Per-side expansion:** the Contract lists venue-agnostic form once; it is emitted per side
   (`*_home`/`*_away` = this match's home/away team). Venue-specific `home_form5_pts` /
   `away_form5_pts` are exactly as frozen.
2. **season_progress granularity:** frozen as "completed/total scheduled **matchweeks**"; MLS
   matchweeks are irregular, so the engine uses the scheduled **match-count fraction** — the
   same monotone quantity at finer granularity, still schedule-only (leak-tested by R5).
3. **Draws (ADR-001, 2026-07-06):** the frozen MOV formula's literal `ln(|gd|+1)` is 0 at
   gd=0; per developer-approved **ADR-001**, draws use **G = 1.0** so `(S−E)` alone scales
   the update. Decisive matches keep the frozen formula unchanged.

## Verified state (2026-07-06)

Builder over the loaded DB: 5,763 RS matches → 5,763 rows, idempotent re-run. Full leakage suite
green (86 passed incl. DB-stored recompute parity).
