// The graded-card mark: a goal mouth with the ball at p(actual) — the probability the
// frozen forecast gave to WHAT ACTUALLY HAPPENED. It is the log-loss chip, drawn:
// log_loss = −ln p, so p = e^−log_loss — the existing number, not a new claim. The same
// mark appears on EVERY graded card (it can never cherry-pick), and a hit at p=0.36 looks
// almost exactly like a miss at p=0.34 — which is true, and is the site's whole point
// about binarising probabilistic claims.
//
// The net ripples only when the ball reaches the goal mouth. The two guardrails at the
// bottom are load-bearing: the knew-nothing baseline (p=⅓) and a coin flip (p=½) must
// NEVER ring the net — a tripwire against quietly lowering the bar until the record
// looks good.
export const GM_W = 92;
export const GM_H = 24;
export const GM_GROUND_Y = 20;
export const GM_AXIS_X0 = 4; // p = 0
export const GM_GOAL_X = 52; // the goal mouth's front edge
export const GM_GOAL_X1 = 85; // the back post
export const GM_BAR_Y = 5; // crossbar height
export const GM_BALL_R = 3;
export const GM_SPAN = 74; // p = 1 lands at x = 78, well inside the mouth

function clamp01(p: number): number {
  return Math.min(1, Math.max(0, p));
}

/** ball position along the ground for a given p(actual) */
export function ballX(p: number): number {
  return GM_AXIS_X0 + clamp01(p) * GM_SPAN;
}

/** the p at which the ball crosses the goal mouth — (52−4)/74 ≈ 0.649 */
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

/** the sagging net: crossbar tip down to the ground at the back post */
export function netPath(): string {
  return `M ${GM_GOAL_X} ${GM_BAR_Y} Q ${GM_GOAL_X1 - 6} ${GM_GROUND_Y - 10} ${GM_GOAL_X1} ${GM_GROUND_Y}`;
}

/** goal frame: crossbar from the mouth to the back post, back post down to the ground */
export function framePath(): string {
  return `M ${GM_GOAL_X} ${GM_BAR_Y} L ${GM_GOAL_X1} ${GM_BAR_Y} L ${GM_GOAL_X1} ${GM_GROUND_Y}`;
}
