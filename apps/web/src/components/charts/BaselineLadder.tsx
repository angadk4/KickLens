// Horizontal baseline-ladder chart: model emphasized in accent, references in gray,
// optional CI whiskers, direct value labels. One ladder per scope — never merged.
import {
  Bar,
  BarChart,
  Cell,
  ErrorBar,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { nats } from "../../lib/format";
import { C, MONO, axisProps } from "./theme";

export type LadderRow = {
  name: string;
  log_loss: number;
  ci95?: [number, number] | null;
  emphasis?: "model" | "market" | "reference";
};

export function BaselineLadder({ rows }: { rows: LadderRow[] }) {
  const data = rows.map((r) => ({
    ...r,
    err: r.ci95 ? [r.log_loss - r.ci95[0], r.ci95[1] - r.log_loss] : undefined,
  }));
  const min = Math.min(...rows.map((r) => (r.ci95 ? r.ci95[0] : r.log_loss)));
  const max = Math.max(...rows.map((r) => (r.ci95 ? r.ci95[1] : r.log_loss)));
  const pad = (max - min) * 0.15 + 0.005;
  return (
    <figure className="chart-figure">
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 44)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }}>
          <XAxis
            type="number"
            domain={[min - pad, max + pad]}
            {...axisProps}
            tickFormatter={(v: number) => v.toFixed(3)}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={168}
            {...axisProps}
            tick={{ fill: C.muted, fontSize: 12, fontFamily: MONO }}
          />
          <Bar dataKey="log_loss" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((r, i) => (
              <Cell
                key={i}
                fill={
                  r.emphasis === "model" ? C.accent : r.emphasis === "market" ? C.cyan : C.gray
                }
                fillOpacity={r.emphasis === "reference" ? 0.55 : 1}
              />
            ))}
            <LabelList
              dataKey="log_loss"
              position="right"
              formatter={(v) => nats(Number(v))}
              style={{ fill: C.muted, fontFamily: MONO, fontSize: 11 }}
            />
            <ErrorBar dataKey="err" direction="x" stroke={C.ink} width={4} strokeWidth={1} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <figcaption>
        Log loss (lower is better). Whiskers: 95% matchweek-block-bootstrap CI where available.
      </figcaption>
      <details>
        <summary>View as table</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Log loss</th>
              <th>95% CI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{nats(r.log_loss)}</td>
                <td className="num">
                  {r.ci95 ? `[${nats(r.ci95[0])}, ${nats(r.ci95[1])}]` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
