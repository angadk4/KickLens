// Calibration — the model's strongest honest claim, so this page DEMONSTRATES it:
// a dot-grid showing what "calibrated 60%" means, per-scope ECE, classwise ECE bars,
// and reliability diagrams where per-bucket data exists.
import { api, type CalibrationScope } from "../../api";
import { ReliabilityDiagram } from "../../components/charts/ReliabilityDiagram";
import { ScopeChip } from "../../components/ui/ScopeChip";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { useApi } from "../../lib/useApi";

const LABELS: Record<string, { label: string; blurb: string }> = {
  dev: {
    label: "Development (walk-forward)",
    blurb: "Calibration measured across the 2018–2024 walk-forward evaluation.",
  },
  test: {
    label: "Test (2025, touch-once)",
    blurb: "Calibration on the sealed one-shot test — the best of all 8 evaluated models.",
  },
  live: {
    label: "Live record",
    blurb: "Appears as graded official forecasts accrue. Never merged with the scopes above.",
  },
};

function DotDemo() {
  return (
    <div className="dot-demo">
      <div className="dd-row">
        <span className="dd-label">we say "60% home win"</span>
        <span className="dd-dots" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`dd-dot ${i < 6 ? "hit" : ""}`} />
          ))}
        </span>
        <span className="mono" style={{ fontSize: "var(--text-sm)" }}>
          → home wins ~6 of those 10 times
        </span>
      </div>
      <div className="dd-row">
        <span className="dd-label">we say "25% draw"</span>
        <span className="dd-dots" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`dd-dot ${i < 2.5 ? "hit" : ""}`} />
          ))}
        </span>
        <span className="mono" style={{ fontSize: "var(--text-sm)" }}>
          → draws happen ~2–3 of those 10 times
        </span>
      </div>
      <p>
        That's calibration: the probability <em>means</em> what it says. ECE (expected
        calibration error) is the average gap between what we said and what happened —{" "}
        <strong>0 is perfect</strong>, and anything under ~0.03 on a three-way market is tight.
        A forecaster can be calibrated and still lose matches; it cannot be trusted without it.
      </p>
    </div>
  );
}

function ClasswiseBars({ s }: { s: CalibrationScope }) {
  const rows = [
    { key: "home", v: s.classwise_ece_H },
    { key: "draw", v: s.classwise_ece_D },
    { key: "away", v: s.classwise_ece_A },
  ].filter((r): r is { key: string; v: number } => typeof r.v === "number");
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.v), 0.06);
  return (
    <div>
      <p className="blurb" style={{ marginBottom: "var(--space-2)" }}>
        Per-outcome calibration error (draws are the market's hardest call — and our tightest):
      </p>
      <div className="classwise">
        {rows.map((r) => (
          <div key={r.key} className="cw-row">
            <span>{r.key}</span>
            <span className="cw-track">
              <span className="cw-fill" style={{ width: `${(r.v / max) * 100}%`, display: "block" }} />
            </span>
            <span>{r.v.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalibrationPage() {
  const { data, error, loading, retry } = useApi(() => api.calibration());
  return (
    <div className="page">
      <Section
        eyebrow="Trustworthiness"
        title="Calibration"
        description="Accuracy asks: did the top pick win? Calibration asks something harder and
        more useful: when we put a number on it, was the number right?"
      >
        <DotDemo />
        {loading && <Skeleton height={200} />}
        {error && <ErrorState retry={retry} />}
        {data &&
          (["dev", "test", "live"] as const).map((scope) => {
            const s: CalibrationScope | undefined = data[scope];
            const meta = LABELS[scope];
            return (
              <section key={scope} className={`scope-panel ${scope}`}>
                <header>
                  <h2>{meta.label}</h2>
                  <ScopeChip scope={scope} n={s?.n ?? null} />
                </header>
                <p className="blurb">{meta.blurb}</p>
                {(!s || (s.n ?? 0) === 0) && (
                  <EmptyState title="No calibration data for this scope yet">
                    {scope === "live"
                      ? "Fills as graded official forecasts accrue — nothing is back-filled."
                      : "Publishes with this scope's evidence."}
                  </EmptyState>
                )}
                {s && (s.n ?? 0) > 0 && (
                  <>
                    {typeof s.ece === "number" && (
                      <dl className="metric-row">
                        <div className="metric">
                          <dt>ece</dt>
                          <dd>
                            {s.ece.toFixed(4)} <small>0 = perfect</small>
                          </dd>
                        </div>
                      </dl>
                    )}
                    <ClasswiseBars s={s} />
                    {s.by_confidence && <ReliabilityDiagram byConfidence={s.by_confidence} />}
                  </>
                )}
              </section>
            );
          })}
      </Section>
    </div>
  );
}
