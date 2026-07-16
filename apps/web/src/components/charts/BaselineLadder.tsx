// Baseline ladder as a dot-and-interval plot (hand-rolled SVG). Bars on a truncated axis
// LIE about magnitude; position encoding doesn't. Dots mark log loss, whiskers span the 95%
// matchweek-block-bootstrap CI where it exists. One ladder per scope — never merged.
// Rows respond to hover/keyboard focus; the sidecar line explains the hovered rung.
import { useState } from "react";
import { nats } from "../../lib/format";
import { C, MONO } from "./theme";

export type LadderRow = {
  name: string;
  log_loss: number;
  ci95?: [number, number] | null;
  emphasis?: "model" | "market" | "reference";
};

const ROW_H = 40;
const LABEL_W = 150;
const VALUE_W = 56;
const PAD_TOP = 8;
const AXIS_H = 28;

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

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span > 0.12 ? 0.05 : span > 0.05 ? 0.02 : 0.01;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= hi + 1e-9; t += step) ticks.push(Number(t.toFixed(3)));
  return ticks;
}

function color(e?: string): string {
  return e === "model" ? C.model : e === "market" ? C.market : C.gray;
}

export function BaselineLadder({ rows, n }: { rows: LadderRow[]; n?: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = rows.flatMap((r) => (r.ci95 ? [r.ci95[0], r.ci95[1]] : [r.log_loss]));
  const rawLo = Math.min(...values);
  const rawHi = Math.max(...values);
  const pad = (rawHi - rawLo) * 0.12 + 0.004;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const W = 720;
  const plotW = W - LABEL_W - VALUE_W;
  const H = PAD_TOP + rows.length * ROW_H + AXIS_H;
  const x = (v: number) => LABEL_W + ((v - lo) / (hi - lo)) * plotW;
  const ticks = niceTicks(lo, hi);
  const champion = rows.find((r) => r.emphasis === "model");
  const h = hover !== null ? rows[hover] : null;
  const delta = h && champion && h !== champion ? champion.log_loss - h.log_loss : null;

  return (
    <figure className="chart-figure">
      {/* min-width + scroll-shadowed container: labels never scale below legibility
          on narrow viewports, and the figure scrolls with a visible affordance */}
      <div className="table-scroll">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", minWidth: 720, height: "auto", display: "block" }}
        role="img"
        aria-label={`Log loss ladder: ${rows.map((r) => `${r.name} ${nats(r.log_loss)}`).join(", ")}`}
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
              fontSize={11}
              fontFamily={MONO}
            >
              {t.toFixed(2)}
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
                x={LABEL_W - 12}
                y={cy + 4}
                textAnchor="end"
                fill={r.emphasis === "model" ? C.ink : C.muted}
                fontSize={12}
                fontFamily={MONO}
                fontWeight={r.emphasis === "model" ? 700 : 400}
              >
                {r.name}
              </text>
              {/* faint row guide */}
              <line
                x1={LABEL_W}
                x2={W - VALUE_W}
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
                x={W - VALUE_W + 10}
                y={cy + 4}
                fill={r.emphasis === "model" ? C.ink : C.muted}
                fontSize={12}
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
      <p className="ladder-sidecar" aria-live="off">
        {h
          ? `${h.name} — ${noteFor(h.name)}${
              h.ci95 ? ` · CI [${nats(h.ci95[0])}, ${nats(h.ci95[1])}]` : ""
            }${
              delta !== null
                ? ` · champion ${delta <= 0 ? "" : "+"}${delta.toFixed(4)} vs this rung`
                : ""
            }`
          : typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches
            ? "hover a rung for its definition, CI, and gap vs the champion"
            : "the table below lists each rung's definition, CI, and value"}
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
