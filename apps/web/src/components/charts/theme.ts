// Chart constants mirroring styles/tokens.css (site is dark-only, so constants are safe).
export const C = {
  ink: "#e8e6f0",
  muted: "#9b97ad",
  faint: "#6e6a80",
  line: "#262238",
  lineStrong: "#363150",
  bg1: "#110f1c",
  bg2: "#181529",
  accent: "#9d7bff",
  accentStrong: "#863bff",
  cyan: "#47bfff",
  home: "#3987e5",
  gray: "#66708a",
  success: "#34d399",
  warn: "#e8a13c",
  danger: "#ef6a5f",
} as const;

export const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

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
