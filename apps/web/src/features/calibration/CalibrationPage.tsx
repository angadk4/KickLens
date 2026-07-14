// Reliability diagrams per scope — calibration is the model's strongest, honest claim.
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
    blurb: "Calibration on the sealed one-shot test — ECE 0.0272 was the best of all 8 models.",
  },
  live: {
    label: "Live record",
    blurb: "Appears as graded official forecasts accrue. Never merged with the scopes above.",
  },
};

export function CalibrationPage() {
  const { data, error, loading, retry } = useApi(() => api.calibration());
  return (
    <div className="page">
      <Section
        eyebrow="Trustworthiness"
        title="Calibration"
        description='A calibrated 60% means "of all the times we said 60%, about 60% happened."
        ECE (expected calibration error) summarizes the gap between predicted probabilities and
        observed frequencies — lower is better. Calibration, not accuracy, is what makes a
        probability worth reading.'
      >
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
                {!s && (
                  <EmptyState title="No calibration data for this scope yet">
                    {scope === "live"
                      ? "Fills as the live record accrues — nothing is back-filled."
                      : "Publishes with this scope's evidence."}
                  </EmptyState>
                )}
                {s && (
                  <>
                    {typeof s.ece === "number" && (
                      <dl className="metric-row">
                        <div className="metric">
                          <dt>ece</dt>
                          <dd>{s.ece.toFixed(4)}</dd>
                        </div>
                      </dl>
                    )}
                    {s.by_confidence ? (
                      <ReliabilityDiagram byConfidence={s.by_confidence} />
                    ) : (
                      <p className="blurb">
                        Summary ECE only for this scope (per-bucket data not published).
                      </p>
                    )}
                  </>
                )}
              </section>
            );
          })}
      </Section>
    </div>
  );
}
