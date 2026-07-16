// Reliability diagram: predicted top-probability vs observed top-pick accuracy per bucket,
// with the perfect-calibration 45° reference and bucket sample sizes as an opacity underlay.
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConfidenceBucket } from "../../api";
import { ChartTooltip } from "./ChartTooltip";
import { C, CURSOR_FILL, axisProps, gridProps } from "./theme";

/** bucket key "0.4-0.5" → midpoint 0.45 (upper bucket "0.6-1.01" clamps sensibly). */
function mid(bucket: string): number {
  const [lo, hi] = bucket.split("-").map(Number);
  return (lo + Math.min(hi, 1)) / 2;
}

export function ReliabilityDiagram({
  byConfidence,
}: {
  byConfidence: Record<string, ConfidenceBucket>;
}) {
  const data = Object.entries(byConfidence)
    .map(([bucket, v]) => ({
      bucket,
      predicted: mid(bucket),
      observed: v.accuracy,
      perfect: mid(bucket),
      n: v.n,
    }))
    .sort((a, b) => a.predicted - b.predicted);
  if (!data.length) return null;
  const maxN = Math.max(...data.map((d) => d.n));
  return (
    <figure className="chart-figure">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ right: 12 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="bucket"
            {...axisProps}
          />
          <YAxis
            domain={[0, 1]}
            {...axisProps}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          />
          <Tooltip
            cursor={{ fill: CURSOR_FILL }}
            content={<ChartTooltip format={(v) => `${(v * 100).toFixed(1)}%`} />}
          />
          <Bar
            dataKey={(d: { n: number }) => d.n / maxN}
            name="relative n"
            fill={C.gray}
            fillOpacity={0.12}
            radius={[4, 4, 0, 0]}
          />
          <Line
            dataKey="perfect"
            name="perfect calibration"
            stroke={C.faint}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="observed"
            name="observed top-pick rate"
            stroke={C.model}
            strokeWidth={2}
            dot={{ r: 4, fill: C.model, stroke: C.bg1, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <figcaption>
        Predicted top-probability vs observed top-pick rate; dashed = perfectly calibrated.
        Faint bars show each bucket's relative sample size.
      </figcaption>
      <details>
        <summary>View as table</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Bucket</th>
              <th>n</th>
              <th>Observed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.bucket}>
                <td className="num">{d.bucket}</td>
                <td className="num">{d.n}</td>
                <td className="num">{(d.observed * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
