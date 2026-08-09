// A number tween on one rAF chain.
//
// This replaces framer-motion's `animate()`, which was the library's ONLY real use in the app
// (the other import, MotionConfig, configured a context with zero consumers — there are no
// motion.* elements anywhere in src/). Carrying motion-dom's whole engine — keyframes, springs,
// projection — in the first-paint bundle for one count-up was ~65 KB raw for a few lines of
// arithmetic.
//
// One-shot, event-bounded, cancelled by its own `stop()`: the same class of rAF that
// lib/useTilt.ts already runs, and the class docs/motion.md rule 7 sanctions.

/** Cubic-bezier easing, the CSS/framer parameterisation: P0=(0,0), P3=(1,1). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton-Raphson first (fast where the curve is well behaved)…
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-6) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    // …bisection as the guaranteed-convergent fallback for flat-slope regions.
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const dx = sampleX(t);
      if (Math.abs(dx - x) < 1e-6) return sampleY(t);
      if (x > dx) lo = t;
      else hi = t;
      const next = (lo + hi) / 2;
      if (Math.abs(next - t) < 1e-7) break;
      t = next;
    }
    return sampleY(t);
  };
}

export type TweenControls = { stop: () => void };

/**
 * Tween a number from `from` to `to`, calling `onUpdate` each frame and landing EXACTLY on
 * `to` on the final frame — a count-up that stops at 0.9999 of its target is a bug the user
 * can read.
 */
export function tween(opts: {
  from: number;
  to: number;
  durationMs: number;
  ease: (t: number) => number;
  onUpdate: (v: number) => void;
}): TweenControls {
  const { from, to, durationMs, ease, onUpdate } = opts;
  let raf = 0;
  let start: number | null = null;
  let stopped = false;

  const frame = (now: number) => {
    if (stopped) return;
    if (start === null) start = now;
    const p = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
    onUpdate(p >= 1 ? to : from + (to - from) * ease(p));
    if (p < 1) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}
