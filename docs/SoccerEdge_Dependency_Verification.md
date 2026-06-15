# SoccerEdge V2.0 — External Dependency & Factual Verification

**Scope:** verify only the external dependencies and factual assumptions of the V2.0 spec. No redesign, no code.
**Date:** June 14, 2026
**Method:** direct reads of provider pages/files + current web research. Findings are tagged **[Confirmed]**, **[Reasonable assumption]**, or **[Unresolved — spike]**. Odds are called "closing" only where the provider labels them so.

**Headline:** Most of V2.0's dependencies check out, and one assumption was wrong in the project's *favour* — the football-data.co.uk MLS file is **current** (updated 26/05/26), not stale as V2 cautioned, and it contains **explicit closing odds back to 2012**. The binding constraints are: (a) historical odds are **closing-only with no timestamps**, so a *same-cutoff* market comparison is **possible live only, not historically**; (b) the historical file has **no stage column and no match IDs**, so excluding playoffs and joining records need extra work; (c) a **free** live-odds source for MLS is **not yet confirmed** (The Odds API is paid for MLS); (d) **no source licenses public redistribution of raw odds**; (e) two small cost substitutions keep the bill at ~$0.

---

## 1. Verified dependency matrix

| Requirement | Proposed provider | Confirmed capability | Coverage | Timestamps | Cost | Licensing | Confidence | Decision |
|---|---|---|---|---|---|---|---|---|
| Historical MLS results | **football-data.co.uk** `new/USA.csv` | Date, time, home/away, goals, result | **MLS 2012→2026**, updated **26/05/26** | Kickoff **date + time** (UTC-style); **no match IDs**; corrected/final (not point-in-time) | $0 | Liability disclaimer only; no redistribution license | **Confirmed** | **Approved** (store/analyze) |
| Historical MLS odds | **football-data.co.uk** `new/USA.csv` | **Closing** 1X2 odds: Pinnacle (`PSC*`), Bet365 (`B365C*`), Betfair Exchange (`BFEC*`), market **avg**/**max** (`AvgC*`/`MaxC*`) | 2012→2026, same rows as results | **Closing only; NO capture timestamps**; no opening/pre-match | $0 | As above | **Confirmed** | **Approved with restrictions** (closing-odds reference; aggregate display only) |
| Regular-season vs playoff split | football-data.co.uk | **Not directly** — no stage/round column | n/a | n/a | $0 | n/a | **Unresolved — spike** | **Replace/augment** (derive stage from live-API round labels or date windows; confirm whether playoffs are even in the file) |
| Live MLS fixtures/results | **API-Football** and/or **Highlightly** (free) | Fixtures, results, standings, **stable fixture IDs**, round labels, postpone/cancel status | MLS **current season** on free tier; **historical seasons gated** | Provider timestamps + status; results finalize post-match | $0 (100 req/day) | ToS restrict bulk redistribution | **Confirmed** (coverage) / **Spike** (current-season free access) | **Approved with restrictions** |
| ~~Live MLS via football-data.org~~ | football-data.org | **Does NOT cover MLS** (EU leagues + Brazil + WC only) | — | — | — | — | **Confirmed (contradicted)** | **Replace** (use for La Liga only) |
| Live MLS 1X2 odds (at cutoff) | **SportsGameOdds** / **Highlightly** (free); **The Odds API = paid for MLS** | Three-way h2h incl. **Draw** is standard; `last_update` timestamps exist | MLS coverage **likely** on SGO/Highlightly free; The Odds API MLS = **$29/mo** | Per-bookmaker `last_update` timestamp | $0 if SGO/Highlightly free covers MLS; else $29/mo | ToS restrict raw-odds redistribution | **Unresolved — spike** | **Optional only** (confirm free MLS three-way + storage/display rights) |
| Database | **Neon** Postgres (free) | Pooled (PgBouncer) **public TLS** endpoint, scale-to-zero | 0.5 GB storage, 100 CU-hr/mo, 1 project | n/a | **$0** (no expiry) | Standard SaaS | **Confirmed** | **Approved** |
| ~~RDS~~ | AWS RDS | Works, but forces a VPC | — | — | Free 12 mo, then **~$12–15/mo** + VPC/NAT | — | **Confirmed (cost risk)** | **Replace** (rejected) |
| Compute | AWS **Lambda** (container for ML) | Container images to **10 GB**; zip hard-capped **250 MB** unzipped | n/a | n/a | ~$0 (free tier; low volume) | — | **Confirmed** | **Approved** (ML fns = container) |
| Internet access for Lambda | **No VPC** (Lambda outside VPC → Neon public endpoint) | Avoids **NAT Gateway ≈ $33/mo/AZ idle** | n/a | n/a | **$0** | — | **Confirmed** | **Approved** |
| Secrets | **SSM Parameter Store** (free) *instead of* Secrets Manager | SecureString, no rotation needed here | n/a | n/a | **$0** (Secrets Manager = $0.40/secret/mo) | — | **Confirmed** | **Approved with amendment** |
| Container registry | **Amazon ECR** | Stores the ML image | n/a | n/a | 500 MB free 12 mo, then ~$0.10/GB-mo (~$0.03–0.10/mo) | — | **Confirmed** | **Approved** |
| Static hosting / CDN | **S3 + CloudFront** | Static React app | n/a | n/a | ~$0 (Always-Free 1 TB + 10M req/mo) | — | **Reasonable assumption** | **Approved** |
| Scheduling | **EventBridge** | Cron rules | n/a | n/a | **$0** (<1M events/mo free) | — | **Confirmed** | **Approved** |
| Logging | **CloudWatch Logs** | Job/API logs | n/a | n/a | First 5 GB/mo ingestion free, then $0.50/GB; storage $0.03/GB-mo | — | **Confirmed** | **Approved with restriction** (short retention) |
| Terraform state | **S3 backend** | Remote state + lock (S3/DynamoDB) | n/a | n/a | ~$0 (pennies) | — | **Reasonable assumption** | **Approved** |
| Training execution | **GitHub Actions** | Runs training, pushes artifact to S3 | n/a | n/a | $0 (public repo / free minutes) | — | **Confirmed** | **Approved** |
| Domain (optional) | Registrar / Route 53 | DNS | n/a | n/a | ~$12–15/yr (~$1/mo); Route 53 hosted zone $0.50/mo | — | **Reasonable assumption** | **Approved** |

---

## 2. Unsupported or inaccurate V2 claims

1. **"football-data.co.uk … last updated mid-2024 (2025–26 currency unverified)" (V2 §10, §44).** **Contradicted (favourably).** The USA file shows **Last updated: 26/05/26** and contains seasons **2012→2026**. The currency caveat should be removed; the file is current.
2. **"odds … final values" without naming them (V2 §10/§24).** **Refine.** They are explicitly **closing** odds (`PSCH` = Pinnacle **C**losing, etc.). V2 may now call them "closing odds" — the provider defines them that way — while still noting **no capture timestamps**.
3. **"market-at-the-same-cutoff" as the primary historical comparison (V2 §24).** **Unsupported for history.** football-data.co.uk supplies only **closing** odds with no timestamps, so a genuine *T-3h* market value **does not exist historically**. Same-cutoff comparison is feasible **live only** (via a captured live-odds snapshot). Historically, only a **closing-odds** (stronger-information) comparison is possible. V2 hints at this but must state it unambiguously.
4. **Match scope excludes playoffs (V2 §3) — assumes the historical source can distinguish them.** **Unverified.** The file has **no stage/round column**; whether MLS Cup playoff matches are even included is unknown. Exclusion must be derived from the live API's round labels or date windows, and the spike must check whether playoffs appear in the file.
5. **Entity model keys matches on "provider fixture id + revision" (V2 §13/§35) — assumes historical rows have provider IDs.** **Partly unsupported.** **Historical** football-data.co.uk rows have **no IDs** (join by season+date+home+away via an alias map; handle defunct/renamed clubs like Chivas USA). Stable provider fixture IDs exist only for **live/current** fixtures from the API.
6. **Market benchmark framed as "optional… may be dropped" (V2 §8/§11).** **Understated.** A **historical** closing-odds benchmark is now clearly **feasible and free**. Only the **live same-cutoff** comparison remains conditional on confirming a free live-odds feed. V2 should upgrade the historical benchmark to "feasible" and keep only the live same-cutoff piece as conditional.
7. **Secrets Manager implied by "secrets in AWS Secrets Manager" (V2 §38).** **Cost-inaccurate for a $0 target.** Secrets Manager is **$0.40/secret/month**; **Parameter Store (standard) is free** and sufficient (no rotation needed). Amend.
8. **"~$0–3/month" (V2 §39) — broadly correct but contingent.** **Confirmed with conditions:** holds **only** with Neon + Lambda-outside-VPC + Parameter Store + short log retention; new-account free-tier credits expire, so the estimate must rest on always-free/usage-free components, which it now does.
9. **"API-Football/Highlightly … current season expected available" (V2 §10).** **Reasonable assumption, not confirmed.** Free tiers gate *historical* seasons; current-season free access is likely but must be confirmed with a live key (spike).
10. **Live-odds public display (V2 §24/§36 say aggregate-only).** **Confirmed correct and necessary** — no provider licenses raw-odds redistribution; keep the aggregate-only rule.

---

## 3. Minimum viable data plan (smallest scientifically valid MVP)

- **Results (training + live):** football-data.co.uk `new/USA.csv` for **MLS 2012→2026** history; **API-Football or Highlightly** (free) for current/future fixtures and final results.
- **Features:** Elo + rolling form + rest/congestion + context, all point-in-time (no odds needed as features).
- **Market:** **none required.** The MVP is scientifically valid as a **calibrated forecaster evaluated against base-rate, Elo, Poisson, and Dixon-Coles baselines** with walk-forward validation and block-bootstrap uncertainty. The market is an enhancement, not a dependency.
- **Why valid:** ~14 seasons of clean results support training, an expanding walk-forward, calibration, and a touch-once final-test season — the full methodology — without any odds.

## 4. Preferred data plan (when sources are available)

- Everything in the minimum plan, **plus**:
- **Historical closing-odds benchmark** from the same football-data.co.uk file (free, already present): compare model-at-cutoff vs **market closing** odds, labelled a *stronger-information reference* (closing odds postdate the T-3h cutoff).
- **Live same-cutoff benchmark:** if the spike confirms a free MLS three-way feed (SportsGameOdds or Highlightly), capture **one odds snapshot per fixture at the cutoff** and compare model-at-cutoff vs **market-at-cutoff** (a genuine like-for-like comparison) going forward.
- **Display:** model probabilities + **aggregate** comparison metrics only; attribute sources; never republish raw odds.

## 5. Fallback plans

- **Historical odds unusable** (e.g., too sparse / join fails): drop the historical market benchmark; ship model-vs-baselines only. Methodology and live loop are unaffected.
- **Live odds unavailable / not free** (spike NO-GO, or only The Odds API at $29/mo): keep the **historical closing-odds** comparison only (clearly labelled), and omit the live same-cutoff comparison; or run the market comparison **internally** and publish only aggregate historical metrics. Do not pay unless you choose to.
- **MLS history insufficient** (e.g., distribution shift makes pre-2018 unusable): restrict the training era to comparable recent seasons (Elo needs little history), widen reliance on Elo/Dixon-Coles, and temper claims with wider confidence intervals; report the reduced sample honestly.
- **Live fixture API failure** (provider down or quota hit): the app reads only the normalized DB and serves last-known data + a freshness banner; ingestion retries with backoff; a **second** free provider (API-Football ↔ Highlightly) is the hot standby; a missed cutoff means an honest "no forecast issued," never a post-kickoff back-fill.
- **Licensing prevents public data display:** publish only the **model's own probabilities** (our output) and **aggregate** model-vs-market metrics; remove any raw-odds and any provider-derived tables from the public surface; keep raw provider data private to the pipeline; attribute sources.
- **A provider changes or shuts down:** the ingestion **adapter** boundary isolates this; swap providers behind the adapter; the canonical schema and stored **raw snapshots** mean past data and predictions survive a provider's disappearance; the historical football-data.co.uk file can be cached locally once downloaded.

## 6. Go/no-go decisions (current feasibility)

| Capability | Decision | Basis |
|---|---|---|
| MLS match forecasting | **GO** | Results 2012→2026 free + current via live API |
| Historical walk-forward testing | **GO** | ~14 seasons of clean results (+ closing odds) |
| Market benchmarking | **GO (with restriction)** | Historical **closing-odds** benchmark is free and present; aggregate display only |
| Same-timestamp market comparison | **GO live-only / NO historically** | football-data.co.uk has **closing odds, no timestamps**; a true T-3h comparison needs a captured **live** snapshot (pending free-feed spike) |
| Live forecast publication | **GO** | The published probabilities are the project's own output |
| Automated grading | **GO** | Final results from the live API |
| Public display of provider-derived data | **NO for raw odds / GO for model output + aggregate metrics** | No redistribution license; ToS restrict raw odds |
| Operating within the proposed monthly budget | **GO (~$0–2/mo)** | Neon free + Lambda-no-VPC + Parameter Store + short log retention; avoids NAT/RDS cliff |

## 7. Required V2 amendments (exact replacement language)

**§10 — football-data.co.uk row.** Replace the currency/odds wording with:
> *football-data.co.uk `new/USA.csv` — **MLS 2012→present, current (file updated within days; verified 26/05/26)**. Provides full-time results and **closing 1X2 odds** (provider-labelled closing): Pinnacle (`PSC*`), Bet365 (`B365C*`), Betfair Exchange (`BFEC*`), and market average/maximum (`AvgC*`/`MaxC*`). **No capture timestamps; closing values only; no opening/pre-match odds; no stage/round column; no match IDs** (join by season+date+home+away via the team-alias map; handle renamed/defunct clubs). Corrected/final dataset, not point-in-time — suitable for training and a closing-odds reference, consistent with the backtest framing in §21.*

**§3 — match exclusion note.** Append:
> *Note: the historical source has no stage/round column, so regular-season vs playoff separation is **derived** — by the live API's round labels for current fixtures and by known playoff date windows for history. The Phase-0 spike must confirm whether MLS Cup playoff matches appear in the historical file and, if so, filter them out before training.*

**§24 — fair market-comparison protocol.** Replace the primary/historical wording with:
> *(a) **Live, going forward (primary, like-for-like):** model-at-cutoff vs a **live market snapshot captured at the same cutoff** — feasible only if the Phase-0 spike confirms a free MLS three-way odds feed; otherwise omitted. (b) **Historical (reference):** model-at-cutoff vs football-data.co.uk **closing** odds, explicitly labelled a **stronger-information reference** because closing odds postdate the T-3h cutoff. A genuine same-cutoff comparison is **not possible on historical data** (closing-only, no timestamps); this limitation is stated wherever historical market metrics appear. (c) **Display:** aggregate model-vs-market metrics only; never republish raw odds.*

**§8 / §11 — market-benchmark status.** Replace "optional… may be dropped" with:
> *A **historical closing-odds benchmark is feasible and free** (football-data.co.uk) and is included. Only the **live same-cutoff** comparison is conditional, pending confirmation of a free MLS odds feed in the Phase-0 spike; if unavailable, the project ships with the historical closing-odds reference (or an internal-only market analysis) and is unaffected scientifically.*

**§13 / §35 — entity keys.** Replace the universal "fixture id + revision" key with:
> *Current/future fixtures are keyed on the **live provider's fixture id + fixture_revision**. **Historical** matches (football-data.co.uk) have **no provider id**; they are identified by a natural key (**season, date, home_team_id, away_team_id**) resolved through `team_alias`, with explicit handling of renamed/relocated/defunct clubs. `source_fixture` stores provider id where one exists and the natural key otherwise.*

**§38 — secrets.** Replace "secrets in AWS Secrets Manager" with:
> *API keys and the database URL are stored in **AWS Systems Manager Parameter Store (standard tier, free)** as SecureString values (no rotation required at this scale); Secrets Manager is avoided to keep cost at ~$0. GitHub Actions uses repository secrets.*

**§39 — cost table.** Add two rows / notes:
> *Secrets: **Parameter Store $0** (not Secrets Manager $0.40/secret/mo). CloudWatch Logs: free under 5 GB/mo ingestion, then $0.50/GB — **set 7–14 day retention**. ECR: 500 MB free for 12 months, then ~$0.10/GB-mo (≈ $0.03–0.10). New-account free-tier credits expire, so this estimate relies only on **always-free/usage-free** components. **Revised total: ~$0–2/month** (+ ~$1/mo if a custom domain is used).*

**Header / §1 status & §44 risk.** Replace the currency risk with:
> *Status: build-ready after the Phase-0 spike, which now narrows to: (1) confirm whether playoffs are in the historical file and how to filter them; (2) confirm current-season MLS access on a free live-results tier (API-Football/Highlightly) and capture team-id mappings; (3) confirm whether a free MLS three-way odds feed exists for the live same-cutoff comparison and whether its ToS permits aggregate display. Historical results and closing odds are **already verified present and current**, so the data foundation for a model-only MVP is confirmed.*

---

### Confirmed vs assumed vs unresolved — summary
- **Confirmed:** MLS results + closing odds 2012→2026 free and current; odds are closing-only without timestamps; no stage column or match IDs in history; football-data.org excludes MLS; The Odds API is paid for MLS (soccer h2h includes Draw); Lambda 250 MB / container 10 GB; NAT ≈ $33/mo idle; Neon free tier specifics; Secrets Manager $0.40/secret vs free Parameter Store; CloudWatch 5 GB free then $0.50/GB; EventBridge free <1M.
- **Reasonable assumptions:** CloudFront/ECR/Terraform-state free-tier sufficiency; API-Football/Highlightly current-season free access; container-Lambda + Neon cold-start acceptable for low traffic.
- **Unresolved (Phase-0 spike):** playoffs present in the historical file?; a **free** MLS three-way live-odds feed + its display ToS?; exact clean-match counts per comparable season after filtering.
