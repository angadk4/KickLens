// The ball's contract with the hero: the RESTING ball never touches the copy, and the rolling
// ball never touches the chalk ring.
//
// ⚠ THE GUARDRAIL CHANGED, DELIBERATELY AND LOUDLY. This file used to assert
// `fitsBand(15) === false`, which was true of the OLD band (134-162, a 28-unit gap set by
// .ph-top's 16px and .ph-bottom's 12px padding). Those two paddings are now --space-5 (24px),
// so the band is 126-174 (48 units) and the same *constraint* now admits r=16. The rule has
// not been weakened — it is still "the resting ball never touches the copy", still measured
// against the CSS, and it still has a tripwire above the shipped value (fitsBand(24)).
import { describe, expect, it } from "vitest";
import {
  BALL_CX,
  BALL_CY,
  BALL_R,
  BAND_BOTTOM,
  BAND_TOP,
  BEAT_RISE,
  equatorEndpoints,
  equatorPath,
  fitsBand,
  fitsBeat,
  PLAY_R,
  ringClearance,
  rollDegrees,
  ROLL_X,
  seamEndpoints,
  seamPath,
  beatPhaseMs,
} from "./pitchBall";

describe("pitchBall geometry", () => {
  it("the shipped radius fits the band; a bigger ball must not", () => {
    expect(fitsBand(BALL_R)).toBe(true);
    expect(fitsBand(16)).toBe(true);
    expect(fitsBand(24)).toBe(false); // the tripwire: this would reach the copy
  });

  it("the band matches the CSS paddings it is derived from", () => {
    // .ph-top ends at 150 − 24 = 126; .ph-bottom starts at 150 + 24 = 174
    expect(BAND_TOP).toBe(126);
    expect(BAND_BOTTOM).toBe(174);
    expect(BALL_CY - BAND_TOP).toBe(BAND_BOTTOM - BALL_CY); // symmetric about the line
  });

  it("the ball still fits the band at the TOP of its bounce", () => {
    expect(fitsBeat(BALL_R, BEAT_RISE)).toBe(true);
    expect(fitsBeat(BALL_R, 12)).toBe(false); // a taller bounce would clip the countdown
  });

  it("seam and equator endpoints lie exactly on the outline circle", () => {
    for (const p of [...seamEndpoints(), ...equatorEndpoints()]) {
      expect(Math.hypot(p.x - BALL_CX, p.y - BALL_CY)).toBeCloseTo(BALL_R, 10);
    }
  });

  it("the paths use the endpoints they declare", () => {
    const seam = seamPath();
    for (const p of seamEndpoints()) expect(seam).toContain(`${p.x} ${p.y}`);
    const eq = equatorPath();
    for (const p of equatorEndpoints()) expect(eq).toContain(`${p.x} ${p.y}`);
  });

  it("the ambient roll stays well inside the ring", () => {
    expect(ROLL_X).toBeLessThan(PLAY_R);
    expect(PLAY_R - ROLL_X).toBeGreaterThan(60); // generous margin, not a squeeze
    expect(ringClearance()).toBeGreaterThan(100);
  });

  it("the horizontal corridor really is many ball-widths wide", () => {
    // the finding that unlocked the hero: the constraint is vertical, not horizontal
    expect(2 * PLAY_R).toBeGreaterThan(8 * BALL_R);
  });

  it("rollDegrees couples travel to rotation, and is scale-free", () => {
    // 48 units at r=16 is exactly 3 radians
    expect(rollDegrees(ROLL_X, BALL_R)).toBeCloseTo(3 * (180 / Math.PI), 10);
    expect(rollDegrees(ROLL_X, BALL_R)).toBeCloseTo(171.887, 3);
    // doubling both leaves the rotation unchanged — this is why one keyframe works at
    // every breakpoint
    expect(rollDegrees(2 * ROLL_X, 2 * BALL_R)).toBeCloseTo(rollDegrees(ROLL_X, BALL_R), 10);
    expect(rollDegrees(0)).toBe(0);
    expect(rollDegrees(-ROLL_X)).toBeCloseTo(-rollDegrees(ROLL_X), 10);
  });

  it("beatPhaseMs lands inside one second", () => {
    expect(beatPhaseMs(0)).toBe(0);
    expect(beatPhaseMs(1_234)).toBe(234);
    for (const t of [0, 1, 999, 1000, 1_722_400_123]) {
      expect(beatPhaseMs(t)).toBeGreaterThanOrEqual(0);
      expect(beatPhaseMs(t)).toBeLessThan(1000);
    }
  });
});
