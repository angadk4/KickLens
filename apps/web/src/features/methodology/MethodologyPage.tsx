// Methodology: the four guarantees as cards, the pipeline as a numbered stepper, the sealed
// baseline ladder, a verify-it-yourself recipe, honest limitations, versions, data lineage.
// Prose comes from the API where it exists so the site and service can't drift apart.
import { Link } from "react-router-dom";
import { api } from "../../api";
import { BaselineLadder } from "../../components/charts/BaselineLadder";
import { ScopeChip } from "../../components/ui/ScopeChip";
import { Section } from "../../components/ui/Section";
import { ErrorState, Skeleton } from "../../components/ui/states";
import { dateShort } from "../../lib/format";
import { useApi } from "../../lib/useApi";

// the four clauses of the contract — set as ruled ledger rows with red mono kickers
const GUARANTEES = [
  {
    kicker: "WRITE-ONCE",
    title: "Frozen at kickoff−3h",
    body: "Official forecasts are written once to an append-only ledger. Post-kickoff writes are rejected outright — an honest 'no forecast' beats a back-filled one.",
  },
  {
    kicker: "SHA-256",
    title: "Hashed & publicly anchored",
    body: "Each forecast's SHA-256 lands in a public GitHub file before the match; a daily Merkle root seals each day. The Git history is the notary.",
  },
  {
    kicker: "AUTO-GRADED",
    title: "Graded automatically",
    body: "Results flow in and every official forecast is scored (log loss, RPS, Brier). Corrections re-grade transparently; originals are kept forever.",
  },
  {
    kicker: "NEVER MERGED",
    title: "Evidence never merged",
    body: "Dev, test, backtest, and live records stay separate, each tagged with its sample size. No blending, no cherry-picking, ever.",
  },
];

/** Sentence-case + typographic dash cleanup for API-sourced prose. */
function tidy(s: string): string {
  const t = s.replaceAll(" - ", " — ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function MethodologyPage() {
  const { data, error, loading, retry } = useApi(() => api.methodology());
  const versions = useApi(() => api.modelVersions());

  return (
    <div className="page">
      <Section
        eyebrow="How and why"
        meta={["4 guarantees"]}
        title="Methodology"
        description="Deliberately simple. Everything here exists to make one claim credible:
        these probabilities were issued before the match, by this exact model, and were
        never touched afterwards."
      >
        <div className="guarantees">
          {GUARANTEES.map((g) => (
            <div key={g.title} className="guarantee">
              <span className="g-kicker">{g.kicker}</span>
              <h3>{g.title}</h3>
              <p>{g.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {loading && <Skeleton height={240} />}
      {error && <ErrorState retry={retry} />}
      {data && (
        <>
          <Section
            eyebrow="The pipeline"
            meta={["6 steps", "no hands"]}
            title="Six steps, fully automated"
            description="From result ingestion to a sealed daily Merkle root — no human touches
            a forecast at any point."
          >
            <div className="stepper">
              <div className="st">
                <strong>Ingest</strong>
                <span>results & fixtures, twice daily</span>
              </div>
              <div className="st">
                <strong>Features</strong>
                <span>point-in-time, leak-tested</span>
              </div>
              <div className="st">
                <strong>Freeze</strong>
                <span>official @ kickoff−3h</span>
              </div>
              <div className="st">
                <strong>Anchor</strong>
                <span>SHA-256 → public GitHub</span>
              </div>
              <div className="st">
                <strong>Grade</strong>
                <span>log loss vs the result</span>
              </div>
              <div className="st">
                <strong>Seal</strong>
                <span>daily Merkle root, 12:00 UTC</span>
              </div>
            </div>
          </Section>

          <Section
            eyebrow="The model"
            meta={["sealed 2026-07-06"]}
            title="Simplest defensible — on purpose"
            description={`${tidy(data.model)}.`}
          >
            <div className="prose">
              <p>
                Feature ablations (form, rest, congestion) added no measurable signal and a
                LightGBM challenger scored worse out-of-fold — so the simplest model that
                survived the evidence won. Probabilities are calibrated with{" "}
                {data.calibration?.param_t
                  ? `temperature scaling (production T = ${data.calibration.param_t.toFixed(3)})`
                  : (data.calibration?.method ?? "temperature scaling")}
                {data.calibration?.note ? ` — ${data.calibration.note}` : ""}.
              </p>
            </div>
            {data.baselines && (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--space-2)",
                    alignItems: "center",
                  }}
                >
                  <ScopeChip scope="dev" n={data.baselines.n} />
                  <span className="chip">sealed 2026-07-06 · selection evidence</span>
                </div>
                <BaselineLadder
                  rows={data.baselines.ladder.map((r) => ({
                    name:
                      r.rung === "champion"
                        ? "champion"
                        : r.rung === "market-closing"
                          ? "market (de-vig)"
                          : `${r.rung} ${
                              {
                                B0: "floor",
                                B1: "home/away",
                                B2: "expanding",
                                B3: "Elo (incumbent)",
                                B4: "Poisson",
                                B5: "Dixon-Coles",
                              }[r.rung] ?? r.name
                            }`,
                    log_loss: r.log_loss,
                    ci95: r.ci95,
                    emphasis:
                      r.rung === "champion"
                        ? "model"
                        : r.rung === "market-closing"
                          ? "market"
                          : "reference",
                  }))}
                />
                <p className="blurb">
                  Every baseline rung (B0–B5) had to be beaten or matched under pre-registered
                  statistics before the champion was frozen — and it was frozen <em>before</em>{" "}
                  the touch-once 2025 test was run. The de-vigged closing market is plotted as
                  a stronger-information reference; it stays ahead, and no market-beating claim
                  is made.
                </p>
              </>
            )}
          </Section>

          <Section
            eyebrow="Trust, but verify"
            meta={["3 steps"]}
            title="Check any forecast yourself"
            description="No trust required — three steps and a terminal."
          >
            <div className="card verify-panel">
              <dl className="kv">
                <dt>1 · get the hash</dt>
                <dd>open any match page — every official forecast shows its SHA-256</dd>
                <dt>2 · find the anchor</dt>
                <dd>
                  {data.anchor_repo_html_url ? (
                    <a href={data.anchor_repo_html_url} target="_blank" rel="noreferrer">
                      anchors/&lt;date&gt;.jsonl in the public repo ↗
                    </a>
                  ) : (
                    "anchors/<date>.jsonl in the public repo"
                  )}{" "}
                  — the same hash, committed before kickoff
                </dd>
                <dt>3 · check the clock</dt>
                <dd>the git commit timestamp predates kickoff — that's the whole proof</dd>
              </dl>
              <pre className="codeblock">{`# recompute a forecast's hash from its canonical JSON (shown on each match page)
python -c "import hashlib;print(hashlib.sha256(open('forecast.json','rb').read()).hexdigest())"`}</pre>
            </div>
          </Section>

          <Section
            eyebrow="What we won't claim"
            title="Honest limitations"
            description="Shown prominently because hiding them would defeat the point."
          >
            <div className="limit-cards">
              {data.honesty_notes.map((note, i) => (
                <div key={i} className="limit-card">
                  <h3>
                    {["Not better than Elo", "Behind the market", "Draws are hard"][i] ?? "Note"}
                  </h3>
                  <p>{tidy(note)}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section eyebrow="Provenance" title="Data & versions">
            <div className="prose">
              <p>
                {data.data}. The system that enforces all of this is documented on{" "}
                <Link to="/engineering">Engineering</Link>.
              </p>
              {data.dataset?.snapshot_hash && (
                <p
                  className="mono"
                  style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)" }}
                >
                  training snapshot {data.dataset.snapshot_hash} · {data.dataset.row_count} rows
                  · {data.dataset.date_range_start} → {data.dataset.date_range_end}
                </p>
              )}
            </div>
            {versions.data && versions.data.length > 0 && (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Label</th>
                      <th>League</th>
                      <th>Created</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.data.map((v) => (
                      <tr key={v.model_version_id}>
                        <td className="num">{v.model_version_id}</td>
                        <td className="mono">{v.label}</td>
                        <td>{v.league}</td>
                        <td className="num">{dateShort(v.created_utc)}</td>
                        <td>
                          {v.is_production
                            ? `production (promoted ${dateShort(v.promoted_utc)})`
                            : "challenger — never auto-promoted"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
