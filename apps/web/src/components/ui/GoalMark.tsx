// The same mark on every graded card: a goal mouth with the ball at p(actual) — the
// probability the frozen forecast gave the result that happened (= e^−log loss, the
// chip's own number, drawn). Symmetric by construction: hits and misses get the identical
// mark, and the net ripples only above the tested threshold (lib/goalMark guardrails).
//
// It is a 1-D chart, not a doodle: the tick at p=⅓ is the knew-nothing baseline, so the
// ball's position relative to it says — per match — whether the forecast beat guessing.
// The entrance rolls FROM that tick, so the direction of travel is the datum and the
// distance is identical for equally-good and equally-bad forecasts.
//
// Draws on first scroll-in via the shared observer; already-visible cards render finished.
import {
  ballX,
  framePath,
  GM_BALL_R,
  GM_BASELINE_P,
  GM_GOAL_X,
  GM_GROUND_Y,
  GM_H,
  GM_TICK_H,
  GM_W,
  isGoal,
  netPath,
  travel,
  travelStart,
} from "../../lib/goalMark";
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
  const x = ballX(p);
  const beat = p > GM_BASELINE_P;
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({
        role: "img",
        "aria-label":
          `The frozen forecast gave ${Math.round(p * 100)}% to what actually happened — ` +
          `${beat ? "better" : "worse"} than the 33% a knew-nothing guess would have given` +
          `${goal ? ", and into the net" : ""}.`,
      } as const);
  return (
    <svg
      ref={ref}
      className={`goal-mark${goal ? " gm-goal" : ""}`}
      viewBox={`0 0 ${GM_W} ${GM_H}`}
      style={{ ["--gm-from" as string]: `${-travel(p)}px` }}
      {...a11y}
    >
      <line
        className="gm-stroke gm-ground"
        x1={0}
        y1={GM_GROUND_Y}
        x2={GM_W}
        y2={GM_GROUND_Y}
        pathLength={1}
      />
      {/* the knew-nothing baseline — the scale that makes the mark readable */}
      <line
        className="gm-tick"
        x1={travelStart()}
        y1={GM_GROUND_Y - GM_TICK_H}
        x2={travelStart()}
        y2={GM_GROUND_Y + GM_TICK_H}
      />
      <text className="gm-tick-label" x={travelStart()} y={GM_H - 1}>
        ⅓
      </text>
      <path className="gm-stroke gm-frame" d={framePath()} pathLength={1} />
      <path className="gm-stroke gm-net" d={netPath()} pathLength={1} />
      <circle className="gm-ball" cx={x} cy={GM_GROUND_Y - GM_BALL_R} r={GM_BALL_R} />
      {/* the number itself: nobody should have to know that "log loss 1.016" means 36% */}
      <text
        className="gm-value"
        x={Math.min(x, GM_GOAL_X - 2)}
        y={GM_GROUND_Y - GM_BALL_R * 2 - 4}
      >
        {(p * 100).toFixed(1)}%
      </text>
    </svg>
  );
}
