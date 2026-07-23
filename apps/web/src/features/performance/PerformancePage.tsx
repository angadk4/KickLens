// Four evidence scopes as visually unmergeable panels (T-171). Each panel: scope strap
// (n · as-of), verdict chips, metrics left / charts right on wide screens, and the market
// transparency callout on the sealed test.
import { api, type MetricsPayload, type Scope } from "../../api";
import { BaselineLadder, type LadderRow } from "../../components/charts/BaselineLadder";
import { ConfidenceChart } from "../../components/charts/ConfidenceChart";
import { ScopeChip } from "../../components/ui/ScopeChip";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import {
  ALWAYS_HOME_ACC_DEV,
  ALWAYS_HOME_ACC_TEST,
  DEV_SEAL_DATE,
  MARKET_LOG_LOSS_DEV,
  MARKET_LOG_LOSS_TEST,
  TEST_EVAL_DATE,
} from "../../lib/facts";
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
      "The sealed touch-once test: evaluated exactly once, after selection was frozen. This " +
      "season can never be re-used. 2025 ran harder for every model including the market " +
      `(${MARKET_LOG_LOSS_TEST.toFixed(4)} vs ${MARKET_LOG_LOSS_DEV.toFixed(4)} on dev) — ` +
      "it had the era's weakest home advantage — and every relative comparison from " +
      "selection replicated out-of-time.",
    emptyNote: "The sealed 2025 snapshot failed to load.",
  },
  {
    scope: "backtest",
    label: "Backtest (labelled)",
    blurb:
      "Retrospective application of the frozen model, clearly labelled as separate from the " +
      "live record. Deliberately empty unless a labelled backtest is published.",
    emptyNote: "No labelled backtest has been published.",
  },
  {
    scope: "live",
    label: "Live record",
    blurb:
      "Official frozen forecasts graded against real results. This is the record that " +
      "matters, and it only accrues in real time. Small live samples are extremely noisy — " +
      "judge trends here in months, not matchdays.",
    emptyNote: "First graded forecasts land after the first official kickoffs.",
  },
];

function asOfShort(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // both parts UTC-pinned — a locally-derived date can be a day off its UTC-labelled time
  return `${d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })} · ${d.toISOString().slice(11, 16)} UTC`;
}

/** Plain-English readings of the numbers — generated, never hand-waved.
    Deltas are computed from DISPLAY precision so a reader subtracting the shown
    figures gets exactly the shown Δ. */
function verdicts(scope: Scope, m: MetricsPayload): { cls: string; text: string; num: string }[] {
  const out: { cls: string; text: string; num: string }[] = [];
  const b3 = scope === "dev" ? m.incumbent_b3_log_loss : m.b3_log_loss;
  if (typeof m.log_loss === "number" && typeof b3 === "number") {
    const d = Number(nats(m.log_loss)) - Number(nats(b3));
    out.push({
      cls: Math.abs(d) < 0.005 ? "neutral" : d < 0 ? "good" : "behind",
      text:
        Math.abs(d) < 0.005
          ? "within the pre-registered 0.005-nat practical band of the Elo baseline"
          : d < 0
            ? "ahead of the Elo baseline"
            : "behind the Elo baseline",
      num: `Δ ${d >= 0 ? "+" : ""}${d.toFixed(4)}`,
    });
  }
  if (typeof m.log_loss === "number" && typeof m.market_log_loss === "number") {
    const d = Number(nats(m.log_loss)) - Number(nats(m.market_log_loss));
    out.push({
      cls: d >= 0 ? "behind" : "good",
      text:
        d >= 0
          ? "closing market ahead (it sees 3 more hours)"
          : "ahead of the closing market",
      num: `Δ ${d >= 0 ? "+" : ""}${d.toFixed(4)}`,
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
    rows.push({ name: "B3 Elo (fallback)", log_loss: b3, emphasis: "reference" });
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
  const hasCharts = ladder.length > 0 || !!m?.by_confidence;
  return (
    <div className="entry">
      <header className="entry-strap">
        <span className="strap-label">{scope}</span>
        <span className="strap-rule" aria-hidden />
        <span className="strap-meta">
          {m?.n != null && (
            <span className="no-caps">n={m.n.toLocaleString()}</span>
          )}
          {/* sealed evidence stamps its EVENT; only the live scope rolls forward */}
          {scope === "dev" && <span>sealed {DEV_SEAL_DATE}</span>}
          {scope === "test" && <span>evaluated once · {TEST_EVAL_DATE}</span>}
          {scope === "live" && data?.as_of_utc && (
            <span>as of {asOfShort(data.as_of_utc)}</span>
          )}
        </span>
      </header>
      <div className="entry-body">
        <section className={`scope-panel ${scope}`}>
          <header>
            <h2>{label}</h2>
            <ScopeChip scope={scope} n={m?.n ?? null} />
          </header>
          {loading && <Skeleton height={90} />}
          {error && <ErrorState retry={retry} />}
          {notFound && (
            <EmptyState title="No data recorded for this scope">{emptyNote}</EmptyState>
          )}
          <div className={hasCharts ? "panel-cols" : undefined}>
            <div style={{ display: "grid", gap: "var(--space-4)", minWidth: 0 }}>
              <p className="blurb">{blurb}</p>
              {m && (
                <>
                  {verdicts(scope, m).length > 0 && (
                    <>
                      <div className="verdicts">
                        {verdicts(scope, m).map((v, i) => (
                          <span key={i} className={`verdict ${v.cls}`}>
                            <span className="v-num">{v.num}</span> {v.text}
                          </span>
                        ))}
                      </div>
                      <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
                        Δ = champion log loss − comparator; positive means the comparator is
                        ahead. Lower is better.
                      </p>
                    </>
                  )}
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
                          {(m.accuracy * 100).toFixed(1)}%{" "}
                          <small>
                            diagnostic only · always-home scored{" "}
                            {scope === "test"
                              ? `${ALWAYS_HOME_ACC_TEST} on 2025`
                              : `${ALWAYS_HOME_ACC_DEV} on dev`}
                          </small>
                        </dd>
                      </div>
                    )}
                  </dl>
                  {scope === "test" &&
                    typeof m.market_log_loss === "number" &&
                    typeof m.log_loss === "number" && (
                      <div className="callout">
                        Closing odds embed the final 3 hours of information the kickoff−3h
                        cutoff can't see — the market gap is shown in every scope where it
                        exists, and no "beats the market" claim is made anywhere.
                      </div>
                    )}
                </>
              )}
            </div>
            {m && hasCharts && (
              <div style={{ display: "grid", gap: "var(--space-4)", minWidth: 0 }}>
                {ladder.length > 0 && <BaselineLadder rows={ladder} n={m.n ?? null} />}
                {m.by_confidence && <ConfidenceChart byConfidence={m.by_confidence} />}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function PerformancePage() {
  return (
    <div className="page">
      <Section
        lead
        eyebrow="Evidence"
        meta={["4 scopes", "log loss decides"]}
        title="Performance"
        description="Four evidence scopes, four separate panels — never merged, never blended,
        each with its own sample size."
      >
        <div className="callout">
          <strong>How to read these numbers.</strong> Log loss measures how surprised the model
          is by actual results — <em>lower is better</em>. A model that knows nothing (⅓/⅓/⅓
          every match) scores <span className="mono">1.0986</span>; every hundredth below that
          is real, hard-won signal. It rewards well-calibrated probabilities, not lucky picks —
          which is why it, and not accuracy, decides everything here.
        </div>
      </Section>
      {SCOPES.map((s) => (
        <ScopePanel key={s.scope} {...s} />
      ))}
    </div>
  );
}
