// The graded-card mark: a goal mouth with the ball at p(actual) — the probability the
// frozen forecast gave to WHAT ACTUALLY HAPPENED. It is the log-loss chip, drawn:
// log_loss = −ln p, so p = e^−log_loss — the existing number, not a new claim. The same
// mark appears on EVERY graded card (it can never cherry-pick), and a hit at p=0.36 looks
// almost exactly like a miss at p=0.34 — which is true, and is the site's whole point
// about binarising probabilistic claims.
//
// It shipped at 92×24 with three of its four elements stroked at 9% alpha (a 19-of-255
// delta) and a 1.8px "ripple", so it read as a faint doodle. Now it is a one-dimensional
// CHART: bigger, contrast-corrected, and carrying a tick at p=⅓ — the knew-nothing
// baseline — so you can see per match whether the forecast beat knowing nothing. The
// entrance rolls the ball FROM the ⅓ tick TO p, which makes the direction of travel the
// datum: forward beat the baseline, backward lost to it. Identical animation either way,
// so no outcome is celebrated over another.
//
// The net ripples only when the ball reaches the goal mouth. The two guardrails at the
// bottom are load-bearing: the knew-nothing baseline (p=⅓) and a coin flip (p=½) must
// NEVER ring the net — a tripwire against quietly lowering the bar until the record
// looks good.
export const GM_W = 132;
export const GM_H = 40;
export const GM_GROUND_Y = 33;
export const GM_AXIS_X0 = 6; // p = 0
export const GM_GOAL_X = 76; // the goal mouth's front edge
export const GM_GOAL_X1 = 122; // the back post
export const GM_BAR_Y = 7; // crossbar height
export const GM_BALL_R = 4.5;
export const GM_SPAN = 108; // p = 1 lands at x = 114, well inside the mouth
export const GM_TICK_H = 4; // baseline tick half-height above/below the ground line

/** the knew-nothing baseline: ⅓/⅓/⅓ every match */
export const GM_BASELINE_P = 1 / 3;

function clamp01(p: number): number {
  return Math.min(1, Math.max(0, p));
}

/** ball position along the ground for a given p(actual) */
export function ballX(p: number): number {
  return GM_AXIS_X0 + clamp01(p) * GM_SPAN;
}

/** the p at which the ball crosses the goal mouth */
export function goalThreshold(): number {
  return (GM_GOAL_X - GM_AXIS_X0) / GM_SPAN;
}

/** did the forecast put enough on the actual result to reach the net? */
export function isGoal(p: number): boolean {
  return clamp01(p) >= goalThreshold();
}

/** p(actual): the frozen probability of the outcome that occurred — e^−log_loss */
export function pActual(
  probs: { p_home: number; p_draw: number; p_away: number },
  result: "H" | "D" | "A",
): number {
  return result === "H" ? probs.p_home : result === "D" ? probs.p_draw : probs.p_away;
}

/** Where the ball's entrance BEGINS — always the baseline tick, on every card. A fixed
    origin is what stops the animation from being able to flatter any single forecast. */
export function travelStart(): number {
  return ballX(GM_BASELINE_P);
}

/** Signed entrance travel, in viewBox units: positive beat the baseline, negative lost. */
export function travel(p: number): number {
  return ballX(p) - travelStart();
}

/** the sagging net: crossbar tip down to the ground at the back post */
export function netPath(): string {
  return `M ${GM_GOAL_X} ${GM_BAR_Y} Q ${GM_GOAL_X1 - 8} ${GM_GROUND_Y - 14} ${GM_GOAL_X1} ${GM_GROUND_Y}`;
}

/** goal frame: crossbar from the mouth to the back post, back post down to the ground */
export function framePath(): string {
  return `M ${GM_GOAL_X} ${GM_BAR_Y} L ${GM_GOAL_X1} ${GM_BAR_Y} L ${GM_GOAL_X1} ${GM_GROUND_Y}`;
}
