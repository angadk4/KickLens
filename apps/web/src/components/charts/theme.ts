// Chart constants mirroring styles/tokens.css (site is light-only, so constants are safe).
// Role keys, not hue keys: the champion series is INK — the record's own line.
export const C = {
  ink: "#1b2420",
  muted: "#48544d",
  faint: "#6c7a70",
  line: "#dce2d2",
  lineStrong: "#a2ad94",
  bg1: "#fafbf5",
  bg2: "#e2e8d5",
  model: "#1b2420", // champion — written in ink
  market: "#4a5d8a", // de-vig closing market — slate
  home: "#2456a8",
  gray: "#8a958c", // reference series / league band
  success: "#1e6b3c",
  warn: "#8a5a00",
  danger: "#b3372b",
} as const;

export const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** Neutral ink wash for hover cursors — never a brand tint. */
export const CURSOR_FILL = "rgba(27, 36, 32, 0.05)";

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
