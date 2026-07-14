// Four evidence scopes as visually unmergeable panels (T-171). Each panel: scope chip + n,
// metric tiles, baseline-ladder chart where reference data exists, by-confidence chart,
// and the market transparency callout.
import { api, type MetricsPayload, type Scope } from "../../api";
import { BaselineLadder, type LadderRow } from "../../components/charts/BaselineLadder";
import { ConfidenceChart } from "../../components/charts/ConfidenceChart";
import { ScopeChip } from "../../components/ui/ScopeChip";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { nats } from "../../lib/format";
import { useApi } from "../../lib/useApi";

const SCOPES: { scope: Scope; label: string; blurb: string; emptyNote: string }[] = [
  {
    scope: "dev",
    label: "Development (2018–2024 walk-forward)",
    blurb:
      "Expanding walk-forward over seven seasons with strict point-in-time features — the " +
      "evidence the model was selected on. Selection was sealed before the test below.",
    emptyNote: "Dev evidence publishes with the selection record.",
  },
  {
    scope: "test",
    label: "Test (2025, touch-once)",
    blurb:
      "The sealed one-shot test: evaluated exactly once, after selection was frozen. This " +
      "season can never be re-used.",
    emptyNote: "Empty until the pre-registered final run.",
  },
  {
    scope: "backtest",
    label: "Backtest (labelled)",
    blurb:
      "Retrospective application of the frozen model, clearly labelled as NOT the live " +
      "record. Deliberately empty unless a labelled backtest is published.",
    emptyNote: "No backtest evidence published — and none is pretended.",
  },
  {
    scope: "live",
    label: "Live record",
    blurb:
      "Official frozen forecasts graded against real results. Starts empty — honestly. " +
      "This is the record that matters, and it only accrues in real time.",
    emptyNote: "First graded forecasts land after the first official kickoffs.",
  },
];

function ladderRows(scope: Scope, m: MetricsPayload): LadderRow[] {
  const rows: LadderRow[] = [];
  const b3 = scope === "dev" ? m.incumbent_b3_log_loss : m.b3_log_loss;
  if (typeof m.market_log_loss === "number")
    rows.push({
      name: "closing market (de-vigged)",
      log_loss: m.market_log_loss,
      emphasis: "market",
    });
  if (typeof b3 === "number")
    rows.push({ name: "B3 Elo baseline", log_loss: b3, emphasis: "reference" });
  if (typeof m.log_loss === "number")
    rows.push({
      name: "champion (this model)",
      log_loss: m.log_loss,
      ci95: m.log_loss_ci95 ?? null,
      emphasis: "model",
    });
  return rows.length >= 2 ? rows : [];
}

function ScopePanel({ scope, label, blurb, emptyNote }: (typeof SCOPES)[number]) {
  const { data, error, notFound, loading, retry } = useApi(() => api.performance(scope));
  const m = data?.metrics;
  const ladder = m ? ladderRows(scope, m) : [];
  return (
    <section className={`scope-panel ${scope}`}>
      <header>
        <h2>{label}</h2>
        <ScopeChip scope={scope} n={m?.n ?? null} />
      </header>
      <p className="blurb">{blurb}</p>
      {loading && <Skeleton height={90} />}
      {error && <ErrorState retry={retry} />}
      {notFound && <EmptyState title="No data recorded for this scope">{emptyNote}</EmptyState>}
      {m && (
        <>
          <dl className="metric-row">
            {(
              [
                ["log_loss", "log loss", nats],
                ["rps", "rps", nats],
                ["brier", "brier", nats],
                ["ece", "ece", nats],
              ] as const
            ).map(
              ([key, label2, fmt]) =>
                typeof m[key] === "number" && (
                  <div className="metric" key={key}>
                    <dt>{label2}</dt>
                    <dd>{fmt(m[key])}</dd>
                  </div>
                ),
            )}
            {typeof m.accuracy === "number" && (
              <div className="metric">
                <dt>accuracy</dt>
                <dd>
                  {(m.accuracy * 100).toFixed(1)}% <small>diagnostic only</small>
                </dd>
              </div>
            )}
          </dl>
          {ladder.length > 0 && <BaselineLadder rows={ladder} />}
          {m.by_confidence && <ConfidenceChart byConfidence={m.by_confidence} />}
          {typeof m.market_log_loss === "number" && typeof m.log_loss === "number" && (
            <div className="callout">
              <strong>The market is still ahead.</strong> The de-vigged closing market scores{" "}
              {nats(m.market_log_loss)} vs the model's {nats(m.log_loss)} on this scope (
              {nats(m.log_loss - m.market_log_loss)} nats). Closing odds embed information from
              the final 3 hours the T−3h cutoff can't see. Shown because hiding it would be
              dishonest; no "beats the market" claim is made anywhere.
            </div>
          )}
          <p className="chip" style={{ justifySelf: "start" }}>
            as of {data?.as_of_utc} · scope: {scope}
          </p>
        </>
      )}
    </section>
  );
}

export function PerformancePage() {
  return (
    <div className="page">
      <Section
        eyebrow="Evidence"
        title="Performance"
        description="Log loss is the primary metric (lower is better; 1.0986 = knowing
        nothing). Four evidence scopes, four separate panels — never merged, never blended,
        each with its own sample size."
      >
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          {SCOPES.map((s) => (
            <ScopePanel key={s.scope} {...s} />
          ))}
        </div>
      </Section>
    </div>
  );
}
