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
        {/* accessibilityLayer={false}: Recharts 3 defaults it ON, which stamps
            role="application" tabindex="0" on the <svg> with NO accessible name. That role
            tells screen readers to leave browse mode and forward every keystroke, so a
            keyboard user lands in an unnamed application region where arrows stop navigating
            the page. It buys nothing here — the figcaption plus the <details> table below
            already reproduce every number the tooltip shows, and the site's three hand-rolled
            SVG charts all use role="img" with a full aria-label. */}
        <BarChart data={data} accessibilityLayer={false}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="bucket" {...axisProps} label={undefined} />
          <YAxis {...axisProps} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            cursor={{ fill: CURSOR_FILL }}
            content={({ active, payload, label }) => {
              const d = payload?.[0]?.payload as
                | { bucket: string; n: number; log_loss: number; accuracy: number }
                | undefined;
              if (!active || !d) return null;
              return (
                <div className="chart-tooltip">
                  <strong>bucket {label}</strong>
                  <span>n = {d.n}</span>
                  <span>log loss {nats(d.log_loss)}</span>
                  <span>top pick hit {(d.accuracy * 100).toFixed(1)}%</span>
                </div>
              );
            }}
          />
          {/* isAnimationActive={false} everywhere: Recharts' grow-in re-serializes `d` per frame */}
          {/* C.model, not C.home: the H|D|A triad is reserved for outcomes, and these bars
              encode log loss by max-probability bucket — a quantity with no home/draw/away
              meaning. The fill was pre-v5 residue that survived the theme pass by not being
              looked at. theme.ts's law: one chalk stroke per chart, and it is the thing the
              chart is about. (Not C.gray — that is reserved for reference series.) */}
          <Bar
            dataKey="log_loss"
            name="log loss"
            fill={C.model}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
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
