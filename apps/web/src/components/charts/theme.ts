// Chart constants mirroring styles/tokens.css (site is dark-only, so constants are safe).
// Role keys, not hue keys: the champion is THE CHALK LINE — the one line the club painted
// on the ground. Exactly one pure-chalk stroke per chart.
//
// AMENDED 2026-07-31: "and it is always the model" no longer holds, because /ratings has no
// model line — it plots team trajectories, which are model INPUTS. There, chalk marks the
// reader's PRIMARY PICK, which is coherent rather than a drift: chalk's other site-wide role
// is *interactive*, and the compare set is the interaction. The rule that survives is the one
// that was always doing the work — exactly one pure-chalk stroke per chart, and it is the
// thing the chart is about.
export const C = {
  ink: "#e8ede6",
  muted: "#a7b3aa",
  faint: "#7d8c7b",
  line: "#223129", // grid
  lineStrong: "#3d5045",
  bg1: "#16211b",
  bg2: "#1d2a23",
  model: "#e8ede6", // champion — chalk
  market: "#8fa7cc", // de-vig closing market — slate, lightened for dark
  home: "#5b9bd9",
  gray: "#71806f", // reference series / league band (graphics-only, ≥3:1)
  success: "#66c28f",
  warn: "#d0a545",
  danger: "#e3796a",
} as const;

/** The compare-set slots, in pick order. Slot 0 is chalk (see the amended law above); the
    other three mirror --series-1/2/3 in tokens.css, where the CVD caveat is written down. */
export const SERIES = [C.model, "#8fb4e0", "#c98fb4", "#5f9aa0"] as const;
export const MAX_COMPARE = SERIES.length;

export const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** Neutral chalk wash for hover cursors — never a brand tint. */
export const CURSOR_FILL = "rgba(232, 237, 230, 0.04)";

export const axisProps = {
  stroke: C.faint,
  tick: { fill: C.muted, fontSize: 11, fontFamily: MONO },
  tickLine: false as const,
  axisLine: { stroke: C.lineStrong },
};

export const gridProps = {
  stroke: C.line,
  strokeDasharray: "0",
  vertical: false as const,
};
