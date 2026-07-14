// Methodology: the model story, the pipeline, the sealed baseline ladder, limitations as
// first-class content, model versions, data sources. Prose comes from the API where it
// exists so the site and the service can't drift apart.
import { api } from "../../api";
import { BaselineLadder } from "../../components/charts/BaselineLadder";
import { ScopeChip } from "../../components/ui/ScopeChip";
import { Section } from "../../components/ui/Section";
import { ErrorState, Skeleton } from "../../components/ui/states";
import { dateShort } from "../../lib/format";
import { useApi } from "../../lib/useApi";

export function MethodologyPage() {
  const { data, error, loading, retry } = useApi(() => api.methodology());
  const versions = useApi(() => api.modelVersions());

  return (
    <div className="page">
      <Section
        eyebrow="How and why"
        title="Methodology"
        description="Deliberately simple, aggressively honest. The whole system exists to make
        one claim credible: these probabilities were issued before the match, by this exact
        model, and were never touched afterwards."
      >
        {loading && <Skeleton height={240} />}
        {error && <ErrorState retry={retry} />}
        {data && (
          <div className="prose">
            <h2>The model</h2>
            <p>{data.model}.</p>
            <p>
              Feature ablations (form, rest, congestion) added no measurable signal, and a
              LightGBM challenger scored worse out-of-fold — so the simplest defensible model
              won. Calibration:{" "}
              {data.calibration?.param_t
                ? `temperature scaling with production T = ${data.calibration.param_t.toFixed(3)}`
                : (data.calibration?.method ?? "temperature scaling")}
              {data.calibration?.note ? `. ${data.calibration.note}` : ""}.
            </p>

            <h2>The pipeline</h2>
            <div className="pipeline">
              <span className="node">ingest results</span>
              <span className="arrow">→</span>
              <span className="node">point-in-time features</span>
              <span className="arrow">→</span>
              <span className="node">freeze @ T−3h</span>
              <span className="arrow">→</span>
              <span className="node">SHA-256 + public anchor</span>
              <span className="arrow">→</span>
              <span className="node">grade vs result</span>
              <span className="arrow">→</span>
              <span className="node">daily Merkle root</span>
            </div>
            <p>{data.cutoff}.</p>
            <p>{data.tamper_evidence}.</p>

            <h2>Evidence separation</h2>
            <p>{data.evidence_separation}.</p>

            {data.baselines && (
              <>
                <h2>Where the model stands</h2>
                <p>
                  The sealed development ladder below is the selection evidence —{" "}
                  {data.baselines.note}
                </p>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <ScopeChip scope="dev" n={data.baselines.n} />
                </div>
                <BaselineLadder
                  rows={data.baselines.ladder.map((r) => ({
                    name:
                      r.rung === "champion"
                        ? "champion (this model)"
                        : r.rung === "market-closing"
                          ? "closing market (de-vigged)"
                          : `${r.rung} — ${r.name}`,
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
              </>
            )}

            <h2>Honest limitations</h2>
            <div className="limit-cards">
              {data.honesty_notes.map((note, i) => (
                <div key={i} className="limit-card">
                  <h3>{["Not better than Elo", "Behind the market", "Draws are hard"][i] ?? "Note"}</h3>
                  <p>{note}</p>
                </div>
              ))}
            </div>

            <h2>Data</h2>
            <p>{data.data}.</p>
            {data.dataset?.snapshot_hash && (
              <p className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)" }}>
                training snapshot {data.dataset.snapshot_hash} · {data.dataset.row_count} rows ·{" "}
                {data.dataset.date_range_start} → {data.dataset.date_range_end}
              </p>
            )}

            {versions.data && versions.data.length > 0 && (
              <>
                <h2>Model versions</h2>
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
              </>
            )}

            {data.anchor_repo_html_url && (
              <p>
                All anchors are public:{" "}
                <a href={data.anchor_repo_html_url} target="_blank" rel="noreferrer">
                  {data.anchor_repo_html_url} ↗
                </a>
              </p>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
