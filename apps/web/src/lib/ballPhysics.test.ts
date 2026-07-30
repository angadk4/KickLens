// The physics has exactly one invariant that matters, and it is not "does it look nice": the
// ball must NEVER end a step outside the chalk ring or inside the hero's copy. That is
// asserted below over thousands of random states, which is the executable form of "the ball
// never covers the countdown".
import { describe, expect, it } from "vitest";
import {
  asleep,
  clampImpulse,
  CX,
  CY,
  keyImpulse,
  restingClear,
  MAX_KICK_MS,
  step,
  SUB,
  tapImpulse,
  TUNE,
  type Ball,
  type Rect,
} from "./ballPhysics";
import { BALL_R, PLAY_R } from "./pitchBall";

const R = BALL_R;
// stand-ins for .ph-top / .ph-bottom, measured in viewBox units
const OBSTACLES: Rect[] = [
  { x0: 40, y0: 20, x1: 260, y1: 126 },
  { x0: 40, y0: 174, x1: 260, y1: 280 },
];

const ball = (px: number, py: number, vx = 0, vy = 0): Ball => ({
  p: { x: px, y: py },
  v: { x: vx, y: vy },
  spin: 0,
});

/** deterministic PRNG so a failure is reproducible */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("ballPhysics", () => {
  it("HARD INVARIANT: a stepped ball NEVER leaves the ring, from any state at any speed", () => {
    const rand = rng(20260729);
    for (let i = 0; i < 4000; i++) {
      const a = rand() * Math.PI * 2;
      const rad = rand() * PLAY_R;
      const s = ball(
        CX + Math.cos(a) * rad,
        CY + Math.sin(a) * rad,
        (rand() - 0.5) * 2 * TUNE.maxSpeed,
        (rand() - 0.5) * 2 * TUNE.maxSpeed,
      );
      const out = step(s, SUB, R, PLAY_R, OBSTACLES);
      expect(Math.hypot(out.p.x - CX, out.p.y - CY)).toBeLessThanOrEqual(PLAY_R + 1e-9);
    }
  });

  it("INVARIANT: from any REACHABLE state the ball never enters the copy", () => {
    // Reachable = starting in the clear band between the two blocks, which is the only place
    // the ball can ever be (it rests at the centre spot and is pushed out of a rect on
    // contact). A deep-inside-a-rect start is unreachable in the product, and it is the one
    // case where the two constraints genuinely conflict — there the RING wins, deliberately,
    // because escaping the visible circle is far worse than a one-frame overlap. That is why
    // this assertion is scoped and the ring assertion above is not.
    const rand = rng(777);
    const bandHalf = 174 - 150 - R; // clear half-height, minus the ball
    for (let i = 0; i < 4000; i++) {
      const s = ball(
        CX + (rand() - 0.5) * 2 * PLAY_R,
        CY + (rand() - 0.5) * 2 * bandHalf,
        (rand() - 0.5) * 2 * TUNE.maxSpeed,
        (rand() - 0.5) * 2 * TUNE.maxSpeed,
      );
      if (Math.hypot(s.p.x - CX, s.p.y - CY) > PLAY_R) continue;
      const out = step(s, SUB, R, PLAY_R, OBSTACLES);
      for (const o of OBSTACLES) {
        const inside =
          out.p.x > o.x0 - R && out.p.x < o.x1 + R && out.p.y > o.y0 - R && out.p.y < o.y1 + R;
        expect(inside).toBe(false);
      }
    }
  });

  it("drag can only REMOVE energy (no free acceleration)", () => {
    // away from the spot-pull regime, so only damping acts
    const s = ball(CX, CY, 600, 0);
    const out = step(s, SUB, R, PLAY_R, []);
    expect(Math.hypot(out.v.x, out.v.y)).toBeLessThan(Math.hypot(s.v.x, s.v.y));
  });

  it("velocity is frame-rate independent, and position error stays sub-pixel", () => {
    const s = ball(CX, CY, 500, 120);
    const one = step(s, SUB, R, PLAY_R, []);
    const two = step(step(s, SUB / 2, R, PLAY_R, []), SUB / 2, R, PLAY_R, []);
    // exponential damping makes the VELOCITY exactly reproducible at any substep…
    expect(two.v.x).toBeCloseTo(one.v.x, 6);
    expect(two.v.y).toBeCloseTo(one.v.y, 6);
    // …while Euler position integration keeps an O(dt) error. It only has to be invisible:
    // well under one viewBox unit (≈1 CSS px at the desktop size).
    expect(Math.abs(two.p.x - one.p.x)).toBeLessThan(0.1);
    expect(Math.abs(two.p.y - one.p.y)).toBeLessThan(0.1);
  });

  it("is deterministic: the same start reproduces the same finish exactly", () => {
    const run = () => {
      let s = ball(CX + 40, CY, 300, -200);
      for (let i = 0; i < 600; i++) s = step(s, SUB, R, PLAY_R, OBSTACLES);
      return s;
    };
    const a = run();
    const b = run();
    expect(a.p.x).toBeCloseTo(b.p.x, 12);
    expect(a.p.y).toBeCloseTo(b.p.y, 12);
    expect(a.spin).toBeCloseTo(b.spin, 12);
  });

  it("a head-on ring bounce reverses the normal velocity and loses (1−restitution)", () => {
    const s = ball(CX + PLAY_R, CY, 400, 0); // moving straight into the boundary
    const out = step(s, SUB, R, PLAY_R, []);
    expect(out.v.x).toBeLessThan(0);
    expect(Math.abs(out.v.x)).toBeLessThan(400 * TUNE.restitutionRing + 1);
  });

  it("a rect hit resolves on the axis of LEAST penetration", () => {
    // just below the top block, moving up: it must be pushed back DOWN, not sideways
    const o: Rect = { x0: 40, y0: 20, x1: 260, y1: 126 };
    const s = ball(150, 126 + R - 1, 0, -300);
    const out = step(s, SUB, R, PLAY_R, [o]);
    expect(out.v.y).toBeGreaterThan(0); // reversed vertically
    expect(out.v.x).toBe(0); // untouched horizontally
  });

  it("the ball creeps home: the spot pulls a slow, distant ball inward", () => {
    const s = ball(CX + 60, CY, 0, 0);
    const out = step(s, SUB, R, PLAY_R, []);
    expect(out.v.x).toBeLessThan(0); // pulled back toward the centre
  });

  it("asleep requires slow AND home — resting on the chalk is not asleep", () => {
    expect(asleep(ball(CX, CY, 0, 0))).toBe(true);
    expect(asleep(ball(CX + PLAY_R, CY, 0, 0))).toBe(false); // far but still
    expect(asleep(ball(CX, CY, 400, 0))).toBe(false); // home but fast
  });

  it("a kick settles in about two seconds — measured, because a slow settle strands it", () => {
    // the ball only hands control back to the CSS ambient loops once asleep() is true, so
    // "eventually" is not good enough: the first tuning took 4.6s and read as a frozen ball
    let s = ball(CX, CY, 210, -120);
    let steps = 0;
    for (; steps < 120 * 10 && !asleep(s); steps++) s = step(s, SUB, R, PLAY_R, OBSTACLES);
    expect(asleep(s)).toBe(true);
    expect(steps * SUB).toBeLessThan(3); // seconds
    expect(Math.hypot(s.p.x - CX, s.p.y - CY)).toBeLessThan(TUNE.sleepDist);
  });

  it("even a maximum-speed smash settles inside the watchdog window", () => {
    let s = ball(CX, CY, TUNE.maxSpeed, 0);
    let steps = 0;
    for (; steps < 120 * 10 && !asleep(s); steps++) s = step(s, SUB, R, PLAY_R, OBSTACLES);
    expect(asleep(s)).toBe(true);
    expect(steps * SUB * 1000).toBeLessThan(MAX_KICK_MS);
  });

  it("spin accumulates with travel and reverses with direction", () => {
    const right = step(ball(CX, CY, 400, 0), SUB, R, PLAY_R, []);
    const left = step(ball(CX, CY, -400, 0), SUB, R, PLAY_R, []);
    expect(right.spin).toBeGreaterThan(0);
    expect(left.spin).toBeLessThan(0);
  });

  it("tapImpulse is an AIMED strike away from where you hit", () => {
    expect(tapImpulse({ x: CX - 10, y: CY }).x).toBeGreaterThan(0); // hit left → goes right
    expect(tapImpulse({ x: CX + 10, y: CY }).x).toBeLessThan(0);
    expect(tapImpulse({ x: CX, y: CY + 10 }).y).toBeLessThan(0); // hit low → goes up
    expect(tapImpulse({ x: CX, y: CY }).y).toBe(-340); // dead centre = toe-poke up
  });

  it("clampImpulse floors a tap and caps a smash", () => {
    expect(Math.hypot(...Object.values(clampImpulse({ x: 1, y: 0 })))).toBeCloseTo(
      TUNE.minKick,
      6,
    );
    expect(Math.hypot(...Object.values(clampImpulse({ x: 5000, y: 0 })))).toBeCloseTo(
      TUNE.maxSpeed,
      6,
    );
    const zero = clampImpulse({ x: 0, y: 0 });
    expect(Math.hypot(zero.x, zero.y)).toBeCloseTo(TUNE.minKick, 6); // never a dead kick
  });

  it("keyImpulse walks the compass so repeated keypresses are a rally", () => {
    const a = keyImpulse(0);
    const b = keyImpulse(1);
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
    expect(keyImpulse(8)).toEqual(keyImpulse(0)); // wraps
    expect(keyImpulse(-1)).toEqual(keyImpulse(7)); // and handles negatives
  });

  it("the resting ball clears realistic obstacles — the dev-time tripwire", () => {
    expect(restingClear(R, OBSTACLES)).toBe(true);
    expect(restingClear(R, [{ x0: 140, y0: 140, x1: 160, y1: 160 }])).toBe(false);
  });
});
