// Log loss by top-probability bucket (single series — the title carries the legend).
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConfidenceBucket } from "../../api";
import { nats } from "../../lib/format";
import { ChartTooltip } from "./ChartTooltip";
import { C, CURSOR_FILL, axisProps, gridProps } from "./theme";

export function ConfidenceChart({
  byConfidence,
}: {
  byConfidence: Record<string, ConfidenceBucket>;
}) {
  const data = Object.entries(byConfidence)
    .map(([bucket, v]) => ({ bucket, ...v }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
  if (!data.length) return null;
  return (
    <figure className="chart-figure">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="bucket" {...axisProps} label={undefined} />
          <YAxis {...axisProps} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            cursor={{ fill: CURSOR_FILL }}
            content={<ChartTooltip format={nats} />}
          />
          <Bar dataKey="log_loss" name="log loss" fill={C.home} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <figcaption>Log loss by max-probability bucket (n varies per bucket).</figcaption>
      <details>
        <summary>View as table</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Bucket</th>
              <th>n</th>
              <th>Log loss</th>
              <th>Accuracy*</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.bucket}>
                <td className="num">{d.bucket}</td>
                <td className="num">{d.n}</td>
                <td className="num">{nats(d.log_loss)}</td>
                <td className="num">{(d.accuracy * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>* accuracy is a diagnostic, never a selection criterion.</p>
      </details>
    </figure>
  );
}
