// The live record, month by month — a dot-per-row plot in the BaselineLadder family
// (position encoding on a shared axis; hand-rolled SVG on the site's tokens). One chalk
// stroke: the record IS the subject, so every dot is C.model — a month below the
// bucket-detail floor renders HOLLOW (an anecdote, not evidence) rather than in a
// different hue. The x-domain always includes the labelled knew-nothing rule, so "better
// or worse than knowing nothing" is readable from position alone, every month.
import { KNEW_NOTHING_LL } from "../../lib/facts";
import { nats } from "../../lib/format";
import type { MonthlyRow } from "../../lib/monthly";
import { monthlyCaption } from "../../lib/monthly";
import { C, MONO } from "./theme";
import { useMeasuredWidth } from "./useMeasuredWidth";

const ROW_H = 34;
const PAD_TOP = 22; // room for the baseline rule's label
const AXIS_H = 28;
const MONO_ADV = 0.6; // IBM Plex Mono advance — measured, not guessed (BaselineLadder)
const LABEL_SHARE = 0.4;

export function MonthlyRecord({ rows }: { rows: MonthlyRow[] }) {
  const [plotRef, measured] = useMeasuredWidth();
  if (rows.length === 0) return null;

  const values = [...rows.map((r) => r.logLoss), KNEW_NOTHING_LL];
  const rawLo = Math.min(...values);
  const rawHi = Math.max(...values);
  const pad = (rawHi - rawLo) * 0.14 + 0.01;
  const lo = rawLo - pad;
  const hi = rawHi + pad;

  const W = Math.max(measured || 640, 260);
  const labelChars = Math.max(...rows.map((r) => r.label.length));
  const valueChars = Math.max(...rows.map((r) => nats(r.logLoss).length));
  const labelCap = Math.round(W * LABEL_SHARE);
  let fs = W < 420 ? 11 : 12;
  if (labelChars * fs * MONO_ADV + 14 > labelCap)
    fs = Math.max(9, Math.floor((labelCap - 14) / (labelChars * MONO_ADV)));
  const LABEL_W = Math.min(Math.ceil(labelChars * fs * MONO_ADV) + 14, labelCap);
  const VALUE_W = Math.ceil(valueChars * fs * MONO_ADV) + 16;
  const plotW = Math.max(60, W - LABEL_W - VALUE_W);
  const H = PAD_TOP + rows.length * ROW_H + AXIS_H;
  const x = (v: number) => LABEL_W + ((v - lo) / (hi - lo)) * plotW;
  const ruleX = x(KNEW_NOTHING_LL);

  return (
    <figure className="chart-figure">
      <div ref={plotRef} className="ladder-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label={`Live log loss by month: ${rows
            .map((r) => `${r.label} ${nats(r.logLoss)} over ${r.n} forecasts`)
            .join(", ")}`}
        >
          {/* the knew-nothing rule — labelled, always in the domain */}
          <line
            x1={ruleX}
            x2={ruleX}
            y1={PAD_TOP - 6}
            y2={PAD_TOP + rows.length * ROW_H}
            stroke={C.gray}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text
            x={ruleX}
            y={12}
            textAnchor="middle"
            fill={C.faint}
            fontSize={Math.min(fs, 11)}
            fontFamily={MONO}
          >
            {KNEW_NOTHING_LL.toFixed(4)} · knew nothing
          </text>
          {rows.map((r, i) => {
            const cy = PAD_TOP + i * ROW_H + ROW_H / 2;
            return (
              <g key={r.key}>
                <title>{`${r.label}: ${nats(r.logLoss)} over ${r.n} graded forecast${r.n === 1 ? "" : "s"}${r.small ? " · small sample" : ""}`}</title>
                <text
                  x={LABEL_W - 10}
                  y={cy + 4}
                  textAnchor="end"
                  fill={C.muted}
                  fontSize={fs}
                  fontFamily={MONO}
                >
                  {r.label}
                </text>
                <line
                  x1={LABEL_W}
                  x2={LABEL_W + plotW}
                  y1={cy}
                  y2={cy}
                  stroke={C.line}
                  strokeWidth={1}
                  strokeDasharray="1 5"
                />
                {/* hollow = below the detail floor; same chalk, weaker claim */}
                <circle
                  cx={x(r.logLoss)}
                  cy={cy}
                  r={5.5}
                  fill={r.small ? C.bg1 : C.model}
                  stroke={r.small ? C.model : C.bg1}
                  strokeWidth={r.small ? 1.5 : 2}
                />
                <text
                  x={LABEL_W + plotW + 10}
                  y={cy + 4}
                  fill={C.muted}
                  fontSize={fs}
                  fontFamily={MONO}
                >
                  {nats(r.logLoss)}
                </text>
              </g>
            );
          })}
          {/* x-axis end labels — two honest anchors beat a tick forest at this size */}
          <text
            x={LABEL_W}
            y={H - 8}
            textAnchor="start"
            fill={C.faint}
            fontSize={Math.min(fs, 11)}
            fontFamily={MONO}
          >
            {lo.toFixed(2)}
          </text>
          <text
            x={LABEL_W + plotW}
            y={H - 8}
            textAnchor="end"
            fill={C.faint}
            fontSize={Math.min(fs, 11)}
            fontFamily={MONO}
          >
            {hi.toFixed(2)}
          </text>
        </svg>
      </div>
      <figcaption>{monthlyCaption(rows)}</figcaption>
      <details>
        <summary>View as table</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">n</th>
              <th className="num">Log loss</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num">{r.n}</td>
                <td className="num">{nats(r.logLoss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
