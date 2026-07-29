// The same mark on every graded card: a goal mouth with the ball at p(actual) — the
// probability the frozen forecast gave the result that happened (= e^−log loss, the
// chip's own number, drawn). Symmetric by construction: hits and misses get the identical
// mark, and the net ripples only above the tested threshold (lib/goalMark guardrails).
// Draws on first scroll-in via the shared observer; already-visible cards render finished.
import { ballX, framePath, GM_BALL_R, GM_GROUND_Y, GM_H, GM_W, isGoal, netPath } from "../../lib/goalMark";
import { useSettle } from "../../lib/reveal";

export function GoalMark({
  p,
  decorative = false,
}: {
  p: number;
  /** inside a link card the mark is decoration — a repeated aria sentence on 50 cards
      would bloat every link's accessible name (the chips already carry the numbers) */
  decorative?: boolean;
}) {
  const ref = useSettle<SVGSVGElement>("gm-live");
  const goal = isGoal(p);
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({
        role: "img",
        "aria-label": `The frozen forecast gave ${Math.round(p * 100)}% to what actually happened${goal ? " — into the net" : ""}.`,
      } as const);
  return (
    <svg
      ref={ref}
      className={`goal-mark${goal ? " gm-goal" : ""}`}
      viewBox={`0 0 ${GM_W} ${GM_H}`}
      {...a11y}
    >
      <line className="gm-stroke gm-ground" x1={0} y1={GM_GROUND_Y} x2={GM_W} y2={GM_GROUND_Y} pathLength={1} />
      <path className="gm-stroke gm-frame" d={framePath()} pathLength={1} />
      <path className="gm-stroke gm-net" d={netPath()} pathLength={1} />
      <circle className="gm-ball" cx={ballX(p)} cy={GM_GROUND_Y - GM_BALL_R} r={GM_BALL_R} />
    </svg>
  );
}
