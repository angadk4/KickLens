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

function asOfShort(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${d.toISOString().slice(11, 16)} UTC`;
}

/** Plain-English readings of the numbers — generated, never hand-waved. */
function verdicts(scope: Scope, m: MetricsPayload): { cls: string; text: string; num: string }[] {
  const out: { cls: string; text: string; num: string }[] = [];
  const b3 = scope === "dev" ? m.incumbent_b3_log_loss : m.b3_log_loss;
  if (typeof m.log_loss === "number" && typeof b3 === "number") {
    const d = m.log_loss - b3;
    out.push({
      cls: Math.abs(d) < 0.005 ? "neutral" : d < 0 ? "good" : "behind",
      text:
        Math.abs(d) < 0.005
          ? "statistically tied with the Elo baseline"
          : d < 0
            ? "ahead of the Elo baseline"
            : "behind the Elo baseline",
      num: `Δ ${d >= 0 ? "+" : ""}${d.toFixed(4)}`,
    });
  }
  if (typeof m.log_loss === "number" && typeof m.market_log_loss === "number") {
    const d = m.log_loss - m.market_log_loss;
    out.push({
      cls: "behind",
      text: "closing market ahead (it sees 3 more hours)",
      num: `Δ +${d.toFixed(4)}`,
    });
  }
  if (typeof m.ece === "number") {
    out.push({
      cls: m.ece <= 0.03 ? "good" : "neutral",
      text: "calibration error (0 = perfectly calibrated)",
      num: `ECE ${m.ece.toFixed(4)}`,
    });
  }
  return out;
}

function ladderRows(scope: Scope, m: MetricsPayload): LadderRow[] {
  const rows: LadderRow[] = [];
  const b3 = scope === "dev" ? m.incumbent_b3_log_loss : m.b3_log_loss;
  if (typeof m.market_log_loss === "number")
    rows.push({ name: "market (de-vig)", log_loss: m.market_log_loss, emphasis: "market" });
  if (typeof b3 === "number")
    rows.push({ name: "Elo baseline", log_loss: b3, emphasis: "reference" });
  if (typeof m.log_loss === "number")
    rows.push({
      name: "champion",
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
          <div className="verdicts">
            {verdicts(scope, m).map((v, i) => (
              <span key={i} className={`verdict ${v.cls}`}>
                <span className="v-num">{v.num}</span> {v.text}
              </span>
            ))}
          </div>
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
              Closing odds embed the final 3 hours of information the T−3h cutoff can't see —
              the market gap is shown because hiding it would be dishonest, and no "beats the
              market" claim is made anywhere.
            </div>
          )}
          <p className="chip" style={{ justifySelf: "start" }} title={data?.as_of_utc}>
            as of {asOfShort(data?.as_of_utc)}
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
        description="Four evidence scopes, four separate panels — never merged, never blended,
        each with its own sample size."
      >
        <div className="callout">
          <strong>How to read these numbers.</strong> Log loss measures how surprised the model
          is by actual results — <em>lower is better</em>. A model that knows nothing (⅓/⅓/⅓
          every match) scores <span className="mono">1.0986</span>; every hundredth below that
          is real, hard-won signal. It rewards honest probabilities, not lucky picks — which is
          why it, and not accuracy, decides everything here.
        </div>
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          {SCOPES.map((s) => (
            <ScopePanel key={s.scope} {...s} />
          ))}
        </div>
      </Section>
    </div>
  );
}
