// Calibration — the model's strongest honest claim, so this page DEMONSTRATES it:
// a dot-grid showing what "calibrated 60%" means, per-scope ECE, classwise ECE bars,
// and reliability diagrams where per-bucket data exists.
import { api, type CalibrationScope } from "../../api";
import { ReliabilityDiagram } from "../../components/charts/ReliabilityDiagram";
import { Entry } from "../../components/ui/Entry";
import { ScopeChip } from "../../components/ui/ScopeChip";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { YourCall } from "../../components/ui/YourCall";
import {
  ECE_DEV_CHAMPION,
  ECE_DEV_MARKET,
  ECE_DEV_RAW,
  ECE_TEST_CHAMPION,
  ECE_TEST_MARKET,
  MIN_N_BUCKET_DETAIL,
} from "../../lib/facts";
import { useApi } from "../../lib/useApi";

const LABELS: Record<string, { label: string; blurb: string }> = {
  dev: {
    label: "Development (walk-forward)",
    blurb: "Calibration measured across the 2018–2024 walk-forward evaluation.",
  },
  test: {
    label: "Test (2025, touch-once)",
    blurb:
      "Calibration on the sealed touch-once test. All seven pre-registered models plus the " +
      "market reference were scored in that single run; the champion was frozen before it, " +
      `and its ECE (${ECE_TEST_CHAMPION.toFixed(4)}) was the best of the seven pre-registered ` +
      `models. The de-vigged closing market was better calibrated still (${ECE_TEST_MARKET.toFixed(4)}), ` +
      "since it sees three hours of information the kickoff−3h cutoff cannot.",
  },
  live: {
    label: "Live record",
    blurb:
      "Appears as graded official forecasts accrue. Never merged with the scopes above. " +
      "Small live samples are extremely noisy, so judge trends here in months, not matchdays.",
  },
};

function DotDemo() {
  return (
    <div className="dot-demo">
      <div className="panel-cols">
        <div style={{ display: "grid", gap: "var(--space-3)", minWidth: 0 }}>
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
        </div>
        <p>
          That's calibration: the probability <em>means</em> what it says. ECE (expected
          calibration error) is the average gap between what we said and what happened, and{" "}
          <strong>0 is perfect</strong>. For scale, on the dev walk-forward: the raw model
          scored {ECE_DEV_RAW.toFixed(3)}, the market {ECE_DEV_MARKET.toFixed(3)}, and the
          calibrated champion {ECE_DEV_CHAMPION.toFixed(3)}. A forecaster can be calibrated
          and still lose matches; it cannot be trusted without it.
        </p>
      </div>
    </div>
  );
}

type CwRow = { key: string; v: number };

/** the three per-outcome errors a scope actually reported */
function classwiseRows(s: CalibrationScope | undefined): CwRow[] {
  if (!s) return [];
  return [
    { key: "home", v: s.classwise_ece_H },
    { key: "draw", v: s.classwise_ece_D },
    { key: "away", v: s.classwise_ece_A },
  ].filter((r): r is CwRow => typeof r.v === "number");
}

/** ONE domain for every per-outcome bar on the page. Auto-scaling each card meant a bar of
    identical length encoded 0.045 on one card and 0.19 on the card beside it — on a page
    whose entire subject is whether a number means what it says. Rounded up to a 0.02 step
    so the printed maximum is readable. */
function sharedScaleMax(scopes: (CalibrationScope | undefined)[]): number {
  const all = scopes.flatMap((s) => classwiseRows(s).map((r) => r.v));
  if (!all.length) return 0.06;
  return Math.max(0.06, Math.ceil(Math.max(...all) * 50) / 50);
}

function ClasswiseBars({
  s,
  scope,
  max,
}: {
  s: CalibrationScope;
  scope: string;
  max: number;
}) {
  const rows = classwiseRows(s);
  if (!rows.length) return null;
  const draws = rows.find((r) => r.key === "draw");
  const drawsBest = !!draws && rows.every((r) => r.v >= draws.v);
  return (
    <div>
      <p className="blurb" style={{ marginBottom: "var(--space-2)" }}>
        Per-outcome calibration error
        {scope === "test" && drawsBest
          ? ". On the sealed 2025 test, draws (the hardest outcome for any model in this class) were the champion's best-calibrated outcome:"
          : ":"}
      </p>
      <div className="classwise">
        {rows.map((r) => (
          <div key={r.key} className="cw-row">
            <span>{r.key}</span>
            <span className="cw-track">
              <span
                className="cw-fill"
                style={{ width: `${(r.v / max) * 100}%`, display: "block" }}
              />
            </span>
            <span>{r.v.toFixed(4)}</span>
          </div>
        ))}
        <div className="cw-row cw-axis">
          <span aria-hidden />
          <span className="cw-scale">
            <span>0</span>
            <span>{max.toFixed(2)}</span>
          </span>
          <span aria-hidden />
        </div>
      </div>
      <p className="cw-foot">
        Every scope on this page shares one 0–{max.toFixed(2)} scale, so bar length means the
        same thing on every card.
      </p>
    </div>
  );
}

export function CalibrationPage() {
  const { data, error, loading, retrying, retry } = useApi(() => api.calibration());
  // the last 10 graded matches, so the toy below can step through them by a stated RULE
  // (most recent first) rather than anyone picking a flattering fixture
  const recent = useApi(() => api.completed(10));
  const barMax = sharedScaleMax([data?.dev, data?.test, data?.live]);
  return (
    <div className="page">
      <Section
        lead
        eyebrow="Trustworthiness"
        meta={["dev · test · live"]}
        title="Calibration"
        description="Accuracy asks: did the top pick win? Calibration asks something harder and
        more useful: when we put a number on it, was the number right?"
      >
        <DotDemo />
      </Section>
      {/* The toy lives HERE and nowhere else: this is the page about how hard calibration is,
          and it shares no Section with a live-scope figure. Six firewalls in the component
          header; the caveat and scope note are enforced by lib/yourCall, not by this markup. */}
      {recent.data && recent.data.items.length > 0 && (
        <Section
          eyebrow="Your call"
          title="What would you have said?"
          description="Set your own three probabilities for a match that has already been graded,
          then see what the frozen forecast said and what actually happened. Watch what the
          numbers do as you drag: being confident and right is rewarded, and being confident and
          wrong is punished harder. That asymmetry is why calibration is difficult."
        >
          <YourCall matches={recent.data.items} />
        </Section>
      )}
      {loading && !retrying && <Skeleton height={200} ball label="loading calibration…" />}
      {(error || retrying) && (
        <ErrorState retry={retry} retrying={retrying} what="calibration" />
      )}
      {data &&
        (["dev", "test", "live"] as const).map((scope) => {
          const s: CalibrationScope | undefined = data[scope];
          const meta = LABELS[scope];
          // dev/test are never gated (large sealed n); live earns its curves at n≥30
          const showDetail = scope !== "live" || (s?.n ?? 0) >= MIN_N_BUCKET_DETAIL;
          return (
            <Entry key={scope}>
              <header className="entry-strap">
                <span className="strap-label">{scope}</span>
                <span className="strap-rule" aria-hidden />
                <span className="strap-meta">
                  {s?.n != null && <span>n={s.n.toLocaleString()}</span>}
                </span>
              </header>
              <div className="entry-body">
                <section className={`scope-panel ${scope}`}>
                  <header>
                    <h2>{meta.label}</h2>
                    <ScopeChip scope={scope} n={s?.n ?? null} />
                  </header>
                  <p className="blurb">{meta.blurb}</p>
                  {(!s || (s.n ?? 0) === 0) && (
                    <EmptyState title="No calibration data for this scope yet">
                      {scope === "live"
                        ? "Fills as graded official forecasts accrue. Nothing is back-filled."
                        : "Publishes with this scope's evidence."}
                    </EmptyState>
                  )}
                  {s && (s.n ?? 0) > 0 && (
                    <div className={showDetail && s.by_confidence ? "panel-cols" : undefined}>
                      <div style={{ display: "grid", gap: "var(--space-4)", minWidth: 0 }}>
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
                        {showDetail ? (
                          <ClasswiseBars s={s} scope={scope} max={barMax} />
                        ) : (
                          <p className="blurb">
                            The reliability curve and per-outcome bars appear once the live
                            sample reaches n≥{MIN_N_BUCKET_DETAIL}. At n={s.n ?? 0},
                            each confidence bucket holds only a handful of forecasts, so a
                            curve would show noise, not calibration.
                          </p>
                        )}
                      </div>
                      {showDetail && s.by_confidence && (
                        <ReliabilityDiagram byConfidence={s.by_confidence} />
                      )}
                    </div>
                  )}
                </section>
              </div>
            </Entry>
          );
        })}
    </div>
  );
}
