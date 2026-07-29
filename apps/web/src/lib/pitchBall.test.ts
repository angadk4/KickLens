// The ball's contract with the hero: stay inside the chalk band between the countdown
// and the fixture line. fitsBand(15) failing is the executable form of "don't disturb
// the countdown" — if someone grows the ball, this test is the tripwire.
import { describe, expect, it } from "vitest";
import {
  BALL_CX,
  BALL_CY,
  BALL_R,
  fitsBand,
  ringClearance,
  seamEndpoints,
  seamPath,
} from "./pitchBall";

describe("pitchBall geometry", () => {
  it("the shipped radius fits the text-free band; a bigger ball must not", () => {
    expect(fitsBand(BALL_R)).toBe(true);
    expect(fitsBand(10)).toBe(true);
    expect(fitsBand(15)).toBe(false); // would collide with the fixture line
  });

  it("an off-center ball loses the fit", () => {
    expect(fitsBand(BALL_R, BALL_CY + 6)).toBe(false);
  });

  it("seam endpoints lie exactly on the outline circle", () => {
    for (const p of seamEndpoints()) {
      const d = Math.hypot(p.x - BALL_CX, p.y - BALL_CY);
      expect(d).toBeCloseTo(BALL_R, 10);
    }
  });

  it("the seam path uses the endpoints it declares", () => {
    const d = seamPath();
    for (const p of seamEndpoints()) {
      expect(d).toContain(`${p.x} ${p.y}`);
    }
  });

  it("the ball clears the hero ring by a wide margin", () => {
    expect(ringClearance()).toBeGreaterThan(100);
  });
});
