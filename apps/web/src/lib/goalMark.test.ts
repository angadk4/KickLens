// The goal mark's honesty guardrails. The first two assertions earn their keep: the
// knew-nothing baseline and a coin flip must NEVER ring the net — if someone lowers the
// threshold until the record looks celebratory, this test fails first.
import { describe, expect, it } from "vitest";
import {
  ballX,
  GM_AXIS_X0,
  GM_BASELINE_P,
  GM_GOAL_X,
  goalThreshold,
  isGoal,
  pActual,
  travel,
  travelStart,
} from "./goalMark";

describe("goalMark", () => {
  it("GUARDRAIL: the knew-nothing baseline (p=1/3) never rings the net", () => {
    expect(isGoal(1 / 3)).toBe(false);
  });

  it("GUARDRAIL: the threshold stays above a coin flip", () => {
    expect(goalThreshold()).toBeGreaterThan(0.5);
  });

  it("p(actual) is e^−log_loss — the identity that makes the mark the existing number", () => {
    const probs = { p_home: 0.52, p_draw: 0.28, p_away: 0.2 };
    for (const result of ["H", "D", "A"] as const) {
      const p = pActual(probs, result);
      const logLoss = -Math.log(p); // how the grade is computed server-side
      expect(Math.exp(-logLoss)).toBeCloseTo(p, 12);
    }
  });

  it("pActual picks the component the result names", () => {
    const probs = { p_home: 0.5, p_draw: 0.3, p_away: 0.2 };
    expect(pActual(probs, "H")).toBe(0.5);
    expect(pActual(probs, "D")).toBe(0.3);
    expect(pActual(probs, "A")).toBe(0.2);
  });

  it("the ball's travel is clamped and the mouth begins exactly at the threshold", () => {
    expect(ballX(0)).toBe(GM_AXIS_X0);
    expect(ballX(-1)).toBe(GM_AXIS_X0);
    expect(ballX(goalThreshold())).toBeCloseTo(GM_GOAL_X, 10);
    expect(ballX(2)).toBe(ballX(1));
  });

  it("a strong-but-honest forecast just short of the bar stays out of the net", () => {
    expect(isGoal(0.6)).toBe(false);
    expect(isGoal(0.68)).toBe(true);
  });

  // ---- the entrance cannot flatter any single forecast ----

  it("GUARDRAIL: every card's roll starts at the SAME baseline tick", () => {
    // a per-card origin could be chosen to make any given forecast look like progress
    expect(travelStart()).toBeCloseTo(ballX(GM_BASELINE_P), 12);
    expect(travelStart()).toBeCloseTo(ballX(1 / 3), 12);
  });

  it("GUARDRAIL: equidistant p's on either side of the baseline travel equal distances", () => {
    const d = 0.15;
    expect(Math.abs(travel(GM_BASELINE_P + d))).toBeCloseTo(
      Math.abs(travel(GM_BASELINE_P - d)),
      12,
    );
  });

  it("travel is signed by whether the forecast beat the baseline, and zero AT it", () => {
    expect(travel(GM_BASELINE_P)).toBeCloseTo(0, 12);
    expect(travel(0.6)).toBeGreaterThan(0);
    expect(travel(0.2)).toBeLessThan(0);
  });

  it("the baseline tick is always outside the goal mouth", () => {
    expect(travelStart()).toBeLessThan(GM_GOAL_X);
  });
});
