// Baseline ladder as a dot-and-interval plot (hand-rolled SVG). Bars on a truncated axis
// LIE about magnitude; position encoding doesn't. Dots mark log loss, whiskers span the 95%
// matchweek-block-bootstrap CI where it exists. One ladder per scope — never merged.
// Rows respond to hover/keyboard focus; the sidecar line explains the hovered rung.
//
// GEOMETRY IS MEASURED, NOT FIXED. The chart used to draw into a hard 720px viewBox behind
// a `min-width: 720` scroller, so at 390px a 306px column showed 43% of the plot: the
// champion's CI cap and the whole value column fell off-screen (and it clipped at desktop
// too, inside the 646px panel column). The SVG now sizes itself to the container each
// render — one user unit = one CSS pixel, so type never scales below legibility — and the
// label / value columns are derived from the widest string at the chosen size. Every rung,
// dot, whisker cap and value is inside the box at 390px.
import { useId, useState } from "react";
import { nats } from "../../lib/format";
import { C, MONO } from "./theme";
import { useMeasuredWidth } from "./useMeasuredWidth";

export type LadderRow = {
  name: string;
  log_loss: number;
  ci95?: [number, number] | null;
  emphasis?: "model" | "market" | "reference";
};

const ROW_H = 40;
const PAD_TOP = 8;
const AXIS_H = 28;
/** IBM Plex Mono is monospaced at exactly 0.6em advance — measured, not guessed. */
const MONO_ADV = 0.6;
/** the widest the row-label column may take before the plot stops being a plot */
const LABEL_SHARE = 0.46;

/** one honest line per rung — shown in the sidecar on hover/focus */
const RUNG_NOTES: Record<string, string> = {
  B0: "uniform ⅓/⅓/⅓ — the know-nothing floor",
  B1: "home/away base rates only",
  B2: "expanding-window base rates",
  B3: "Elo ordinal — the pre-registered fallback",
  B4: "independent Poisson goals",
  B5: "Dixon-Coles adjusted Poisson",
  champion: "the production model — multinomial logistic on Elo difference",
  market: "de-vigged closing odds — a stronger-information reference, not a model",
};

function noteFor(name: string): string {
  const key = Object.keys(RUNG_NOTES).find((k) => name.toLowerCase().includes(k.toLowerCase()));
  return key ? RUNG_NOTES[key] : "";
}

const TICK_STEPS = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.5, 1];

/** Decimal places needed to print a step without collapsing distinct ticks onto one label.
    Derived from the step itself rather than hardcoded: TICK_STEPS holds 0.005 AND 0.025, so
    a `step < 0.01 ? 3 : 2` rule would still render 0.025's ticks as 1.03 / 1.08 — right count,
    wrong numbers. */
function precisionFor(step: number): number {
  for (let p = 0; p <= 4; p++) {
    if (Math.abs(Number(step.toFixed(p)) - step) < 1e-9) return p;
  }
  return 4;
}

/** Nice ticks that also FIT: the narrower the plot, the coarser the step. Returns the chosen
    step alongside the values, because the AXIS FORMATTER needs it — printing every tick at
    toFixed(2) under a 0.005 step rendered "1.01 1.01 1.02 1.02 1.03 1.03 …": ten gridlines,
    five labels, and the 1.015 line mislabelled 1.01 by exactly the 0.005 threshold the page
    names one screen above. Positions were always right; only the text lied. */
function niceTicks(lo: number, hi: number, maxTicks: number): { ticks: number[]; step: number } {
  for (const step of TICK_STEPS) {
    const start = Math.ceil(lo / step - 1e-9) * step;
    const count = Math.floor((hi - start) / step + 1e-9) + 1;
    if (count < 1) continue;
    if (count <= maxTicks) {
      const ticks: number[] = [];
      for (let i = 0; i < count; i++) ticks.push(Number((start + i * step).toFixed(3)));
      return { ticks, step };
    }
  }
  return { ticks: [], step: 0.01 };
}

function color(e?: string): string {
  return e === "model" ? C.model : e === "market" ? C.market : C.gray;
}

export function BaselineLadder({ rows, n }: { rows: LadderRow[]; n?: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [plotRef, measured] = useMeasuredWidth();
  const descId = useId();

  const values = rows.flatMap((r) => (r.ci95 ? [r.ci95[0], r.ci95[1]] : [r.log_loss]));
  const rawLo = Math.min(...values);
  const rawHi = Math.max(...values);
  const pad = (rawHi - rawLo) * 0.12 + 0.004;
  const lo = rawLo - pad;
  const hi = rawHi + pad;

  // ---- responsive geometry, all derived from the measured width ----
  const W = Math.max(measured || 640, 260);
  const labelChars = Math.max(...rows.map((r) => r.name.length));
  const valueChars = Math.max(...rows.map((r) => nats(r.log_loss).length));
  const labelCap = Math.round(W * LABEL_SHARE);
  // step the type down before the labels are allowed to run out of their column
  let fs = W < 420 ? 11 : 12;
  if (labelChars * fs * MONO_ADV + 14 > labelCap)
    fs = Math.max(9, Math.floor((labelCap - 14) / (labelChars * MONO_ADV)));
  const LABEL_W = Math.min(Math.ceil(labelChars * fs * MONO_ADV) + 14, labelCap);
  const VALUE_W = Math.ceil(valueChars * fs * MONO_ADV) + 16;
  const plotW = Math.max(60, W - LABEL_W - VALUE_W);
  const H = PAD_TOP + rows.length * ROW_H + AXIS_H;
  const x = (v: number) => LABEL_W + ((v - lo) / (hi - lo)) * plotW;
  const tickFs = Math.min(fs, 11);
  const { ticks, step: tickStep } = niceTicks(
    lo,
    hi,
    Math.max(2, Math.floor(plotW / (4 * tickFs * MONO_ADV + 12))),
  );
  const tickDp = precisionFor(tickStep);

  const champion = rows.find((r) => r.emphasis === "model");
  const h = hover !== null ? rows[hover] : null;
  const delta = h && champion && h !== champion ? champion.log_loss - h.log_loss : null;

  return (
    <figure className="chart-figure">
      <div ref={plotRef} className="ladder-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label={`Log loss ladder: ${rows.map((r) => `${r.name} ${nats(r.log_loss)}`).join(", ")}`}
          aria-describedby={descId}
        >
          {/* gridlines + axis ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={PAD_TOP}
                y2={PAD_TOP + rows.length * ROW_H}
                stroke={C.line}
                strokeWidth={1}
              />
              <text
                x={x(t)}
                y={H - 8}
                textAnchor="middle"
                fill={C.faint}
                fontSize={tickFs}
                fontFamily={MONO}
              >
                {t.toFixed(tickDp)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cy = PAD_TOP + i * ROW_H + ROW_H / 2;
            const c = color(r.emphasis);
            return (
              <g
                key={r.name}
                className="lr"
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <title>{`${r.name}: ${nats(r.log_loss)}${r.ci95 ? ` [${nats(r.ci95[0])}, ${nats(r.ci95[1])}]` : ""}`}</title>
                {/* hover/focus row tint */}
                <rect
                  className="lr-bg"
                  x={0}
                  y={cy - ROW_H / 2}
                  width={W}
                  height={ROW_H}
                  fill="rgba(232, 237, 230, 0.04)"
                />
                {/* row label */}
                <text
                  x={LABEL_W - 10}
                  y={cy + 4}
                  textAnchor="end"
                  fill={r.emphasis === "model" ? C.ink : C.muted}
                  fontSize={fs}
                  fontFamily={MONO}
                  fontWeight={r.emphasis === "model" ? 700 : 400}
                >
                  {r.name}
                </text>
                {/* faint row guide */}
                <line
                  x1={LABEL_W}
                  x2={LABEL_W + plotW}
                  y1={cy}
                  y2={cy}
                  stroke={C.line}
                  strokeWidth={1}
                  strokeDasharray="1 5"
                />
                {/* CI whisker */}
                {r.ci95 && (
                  <g stroke={c} strokeWidth={1.5} opacity={0.85}>
                    <line x1={x(r.ci95[0])} x2={x(r.ci95[1])} y1={cy} y2={cy} />
                    <line x1={x(r.ci95[0])} x2={x(r.ci95[0])} y1={cy - 5} y2={cy + 5} />
                    <line x1={x(r.ci95[1])} x2={x(r.ci95[1])} y1={cy - 5} y2={cy + 5} />
                  </g>
                )}
                {/* dot */}
                <circle
                  className="lr-dot"
                  cx={x(r.log_loss)}
                  cy={cy}
                  r={r.emphasis === "model" ? 6.5 : 5}
                  fill={c}
                  stroke={C.bg1}
                  strokeWidth={2}
                />
                {/* value */}
                <text
                  x={LABEL_W + plotW + 10}
                  y={cy + 4}
                  fill={r.emphasis === "model" ? C.ink : C.muted}
                  fontSize={fs}
                  fontFamily={MONO}
                  fontWeight={r.emphasis === "model" ? 700 : 400}
                >
                  {nats(r.log_loss)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {/* the affordance is an ACCESSIBLE description, not page copy — it used to render as a
          visible sentence between the plot and its caption on every viewport */}
      <p id={descId} className="sr-only">
        Hover or focus any rung for its definition, its 95% confidence interval, and its gap
        versus the champion. The table below lists each rung's definition, CI, and value.
      </p>
      <p className="ladder-sidecar" aria-live="off">
        {h
          ? `${h.name} — ${noteFor(h.name)}${
              h.ci95 ? ` · CI [${nats(h.ci95[0])}, ${nats(h.ci95[1])}]` : ""
            }${
              delta !== null
                ? ` · champion ${delta <= 0 ? "" : "+"}${delta.toFixed(4)} vs this rung`
                : ""
            }`
          : ""}
      </p>
      <figcaption>
        Log loss{typeof n === "number" ? ` (n=${n.toLocaleString()})` : ""} — lower is better;
        dots mark the point estimate, whiskers the 95% matchweek-block-bootstrap CI where one
        exists.
      </figcaption>
      <details>
        <summary>View as table</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th className="num">Log loss</th>
              <th className="num">95% CI</th>
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
