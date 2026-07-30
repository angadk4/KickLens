// The hero ball's physics. Pure: no DOM, no framer, no dependency (a WASM engine would be
// blocked by our CSP anyway, and this is ~80 lines).
//
// Coordinates are viewBox units (1 unit ≈ 1px at --ph-size: 300px); time is seconds.
// Semi-implicit Euler with EXPONENTIAL damping, so 60Hz and 144Hz produce identical
// trajectories, plus a FIXED substep so they also produce identical collisions.
import { BALL_CX, BALL_CY } from "./pitchBall";

export type Vec = { x: number; y: number };
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Ball = { p: Vec; v: Vec; spin: number };

export const CX = BALL_CX;
export const CY = BALL_CY;

/** The fixed integration substep. The caller accumulates real time and steps in these. */
export const SUB = 1 / 120;
/** A backgrounded tab returns with a dt measured in seconds — never integrate that. */
export const MAX_FRAME = 0.1;

// Tuned by measurement, not feel: a kick must come to rest in about two seconds. The first
// tuning (damping 2.4 / returnK 5.4 / sleep 1.5) took 4.6s for a typical kick and could sit
// near a wall longer, which mattered because the ball only hands control back to the CSS
// ambient loops once `asleep()` is true — a slow settle read as a ball frozen mid-flight.
export const TUNE = {
  damping: 4, // s⁻¹ rolling friction; e-folding 0.25s
  restitutionRing: 0.62, // chalk circle
  restitutionRect: 0.55, // a padded copy block absorbs more than a line
  tangentialLoss: 0.96, // the scrub of sliding along the chalk
  returnSpeed: 140, // u/s — below this the centre spot starts pulling
  returnK: 11, // s⁻²; with the drag above ζ≈0.60 → one small overshoot, then home
  sleepSpeed: 3, // u/s — visually at rest
  sleepDist: 0.8, // u from the spot
  maxSpeed: 900, // u/s — crosses the ring in ~0.29s: fast, still trackable
  minKick: 160, // u/s — a bare tap must still travel ~55u
} as const;

/** A kick must ALWAYS end. Whatever the tuning does, the loop is force-stopped after this, so
    the ball can never be stranded mid-flight with the CSS ambient loops suspended. */
export const MAX_KICK_MS = 6000;

/** One fixed substep. Never call with a variable dt — that is what the accumulator is for. */
export function step(s: Ball, dt: number, r: number, playR: number, obstacles: Rect[]): Ball {
  // 1 — exponential drag: frame-rate independent, unlike (1 − k·dt)
  const drag = Math.exp(-TUNE.damping * dt);
  let vx = s.v.x * drag;
  let vy = s.v.y * drag;

  // 2 — the spot pulls, but only once the ball is slow: a fast ball must never read as yanked
  if (Math.hypot(vx, vy) < TUNE.returnSpeed) {
    vx += TUNE.returnK * (CX - s.p.x) * dt;
    vy += TUNE.returnK * (CY - s.p.y) * dt;
  }

  // 3 — integrate
  let px = s.p.x + vx * dt;
  let py = s.p.y + vy * dt;

  // 4 — the chalk circle: reflect about the inward normal, then PROJECT back onto the
  //     boundary. The projection is what makes this tunnel-free at any dt.
  const bounceRing = () => {
    const rx = px - CX;
    const ry = py - CY;
    const d = Math.hypot(rx, ry);
    if (d <= playR || d === 0) return;
    const nx = rx / d;
    const ny = ry / d;
    px = CX + nx * playR;
    py = CY + ny * playR;
    const vn = vx * nx + vy * ny;
    if (vn > 0) {
      vx -= (1 + TUNE.restitutionRing) * vn * nx;
      vy -= (1 + TUNE.restitutionRing) * vn * ny;
      vx *= TUNE.tangentialLoss;
      vy *= TUNE.tangentialLoss;
    }
  };
  bounceRing();

  // 5 — the copy blocks, inflated by r → point-vs-rect. Resolve on the axis of LEAST
  //     penetration: that is what makes a bounce off the countdown read as vertical.
  for (const o of obstacles) {
    const ix0 = o.x0 - r;
    const ix1 = o.x1 + r;
    const iy0 = o.y0 - r;
    const iy1 = o.y1 + r;
    if (px <= ix0 || px >= ix1 || py <= iy0 || py >= iy1) continue;
    const L = px - ix0;
    const R = ix1 - px;
    const T = py - iy0;
    const B = iy1 - py;
    const m = Math.min(L, R, T, B);
    if (m === T) {
      py = iy0;
      if (vy > 0) vy = -vy * TUNE.restitutionRect;
    } else if (m === B) {
      py = iy1;
      if (vy < 0) vy = -vy * TUNE.restitutionRect;
    } else if (m === L) {
      px = ix0;
      if (vx > 0) vx = -vx * TUNE.restitutionRect;
    } else {
      px = ix1;
      if (vx < 0) vx = -vx * TUNE.restitutionRect;
    }
  }

  // 6 — the ring is the HARDER constraint, so it gets the last word. Pushing a ball out of a
  //     rect by its nearest edge can eject it past the ring (reachable only if a resize drops
  //     a rect on top of a moving ball); a one-frame rect overlap is a far smaller sin than
  //     escaping the visible circle, so ring containment is re-asserted here unconditionally.
  bounceRing();

  // 7 — roll: arc length / radius radians, signed by the direction of travel
  const moved = Math.hypot(px - s.p.x, py - s.p.y);
  const dir = Math.sign(px - s.p.x) || 1;
  return {
    p: { x: px, y: py },
    v: { x: vx, y: vy },
    spin: s.spin + (moved / r) * dir,
  };
}

/** Asleep = slow AND home. BOTH: a ball resting against the chalk must keep creeping back. */
export function asleep(s: Ball): boolean {
  return (
    Math.hypot(s.v.x, s.v.y) < TUNE.sleepSpeed &&
    Math.hypot(s.p.x - CX, s.p.y - CY) < TUNE.sleepDist
  );
}

/** A click with no drag is an AIMED strike: you hit the side you clicked, so the ball leaves
    the other way. Dead centre is a toe-poke, straight up. */
export function tapImpulse(hit: Vec, centre: Vec = { x: CX, y: CY }, speed = 340): Vec {
  const dx = centre.x - hit.x;
  const dy = centre.y - hit.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return { x: 0, y: -speed };
  return { x: (dx / d) * speed, y: (dy / d) * speed };
}

/** Clamp a kick into the playable range, and never let a zero-length flick do nothing. */
export function clampImpulse(v: Vec): Vec {
  const s = Math.hypot(v.x, v.y);
  if (s === 0) return { x: 0, y: -TUNE.minKick };
  const k = Math.min(TUNE.maxSpeed, Math.max(TUNE.minKick, s)) / s;
  return { x: v.x * k, y: v.y * k };
}

/** 8 compass points, ADVANCED per keypress — so repeated Space is a rally, not a repeat. */
const COMPASS: Vec[] = [
  { x: 0, y: -1 },
  { x: 0.7, y: -0.7 },
  { x: 1, y: 0 },
  { x: 0.7, y: 0.7 },
  { x: 0, y: 1 },
  { x: -0.7, y: 0.7 },
  { x: -1, y: 0 },
  { x: -0.7, y: -0.7 },
];

export function keyImpulse(n: number, speed = 420): Vec {
  const c = COMPASS[((n % COMPASS.length) + COMPASS.length) % COMPASS.length] ?? COMPASS[0]!;
  return { x: c.x * speed, y: c.y * speed };
}

/** Does the ball, at rest, overlap any obstacle? A dev-time tripwire for measured rects. */
export function restingClear(r: number, obstacles: Rect[]): boolean {
  return obstacles.every(
    (o) => CX <= o.x0 - r || CX >= o.x1 + r || CY <= o.y0 - r || CY >= o.y1 + r,
  );
}
