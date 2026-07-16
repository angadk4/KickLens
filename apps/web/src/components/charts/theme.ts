// Chart constants mirroring styles/tokens.css (site is dark-only, so constants are safe).
// Role keys, not hue keys: the champion is THE CHALK LINE — the one line the club painted
// on the ground. Exactly one pure-chalk stroke per chart, and it is always the model.
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
