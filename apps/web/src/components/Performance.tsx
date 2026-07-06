// Evidence-separated performance: one panel per scope, sample size always shown,
// scopes never merged (Contract §2 / T-171). Recharts renders the by-confidence view.
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Performance as Perf, type Scope } from "../api";

const SCOPES: { scope: Scope; label: string; blurb: string }[] = [
  {
    scope: "dev",
    label: "Dev (2018–2024 walk-forward)",
    blurb: "In-development evidence used for model selection. Not out-of-sample proof.",
  },
  {
    scope: "test",
    label: "Test (2025, touch-once)",
    blurb: "The sealed one-shot test. Empty until the pre-registered final run.",
  },
  {
    scope: "backtest",
    label: "Backtest (labelled)",
    blurb: "Retrospective application of the frozen model. Clearly not the live record.",
  },
  {
    scope: "live",
    label: "Live record",
    blurb: "Forecasts frozen before kickoff, graded automatically. Starts empty — honestly.",
  },
];

type ConfidenceBucket = { bucket: string; log_loss: number; accuracy: number; n: number };

export function Performance() {
  const [panels, setPanels] = useState<Record<string, Perf | "empty" | "loading">>({});

  useEffect(() => {
    for (const { scope } of SCOPES) {
      setPanels((p) => ({ ...p, [scope]: "loading" }));
      api
        .performance(scope)
        .then((perf) => setPanels((p) => ({ ...p, [scope]: perf })))
        .catch(() => setPanels((p) => ({ ...p, [scope]: "empty" })));
    }
  }, []);

  return (
    <div className="scopes">
      {SCOPES.map(({ scope, label, blurb }) => {
        const panel = panels[scope];
        return (
          <section key={scope} className={`scope ${scope}`}>
            <h2>
              {label} <span className="tag scope-tag">{scope}</span>
            </h2>
            <p className="muted">{blurb}</p>
            {panel === "loading" && <p className="muted">Loading…</p>}
            {panel === "empty" && <p className="muted">No data recorded for this scope.</p>}
            {panel && panel !== "loading" && panel !== "empty" && <Metrics perf={panel} />}
          </section>
        );
      })}
    </div>
  );
}

function Metrics({ perf }: { perf: Perf }) {
  const m = perf.metrics as Record<string, unknown>;
  const n = typeof m.n === "number" ? m.n : 0;
  const byConf = (m.by_confidence ?? {}) as Record<
    string,
    { n: number; log_loss: number; accuracy: number }
  >;
  const chart: ConfidenceBucket[] = Object.entries(byConf).map(([bucket, v]) => ({
    bucket,
    ...v,
  }));
  return (
    <>
      <dl className="stats">
        <div>
          <dt>sample size</dt>
          <dd>{n}</dd>
        </div>
        {(["log_loss", "rps", "brier", "ece", "accuracy"] as const).map(
          (k) =>
            typeof m[k] === "number" && (
              <div key={k}>
                <dt>{k.replace("_", " ")}</dt>
                <dd>{(m[k] as number).toFixed(4)}</dd>
              </div>
            ),
        )}
      </dl>
      {chart.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" label={{ value: "max probability", dy: 12 }} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="log_loss" name="log loss" fill="#4c6ef5" />
          </BarChart>
        </ResponsiveContainer>
      )}
      <p className="muted small">as of {perf.as_of_utc} · scope: {perf.scope}</p>
    </>
  );
}
