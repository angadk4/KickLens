// This replaced framer-motion's animate(). The count-up it drives is the only motion on the
// stat tiles, and a tween that lands on 0.9999 of its target renders a number the reader can
// see is wrong — so the endpoints are pinned exactly, not approximately.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cubicBezier, tween } from "./tween";

const EASE = cubicBezier(0.16, 1, 0.3, 1); // the site's settle curve

// The suite runs in the node environment, so there is no rAF to spy on. Drive frames by hand:
// deterministic, and it lets a test land the final frame exactly on the duration boundary.
let pending: Map<number, FrameRequestCallback>;
let nextId: number;

function setupRaf(): void {
  pending = new Map();
  nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
}

/** Run every queued callback at timestamp `t`. */
function step(t: number): void {
  const queued = [...pending.values()];
  pending.clear();
  for (const cb of queued) cb(t);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cubicBezier", () => {
  it("is exact at both endpoints", () => {
    expect(EASE(0)).toBe(0);
    expect(EASE(1)).toBe(1);
  });

  it("clamps outside [0,1] rather than extrapolating", () => {
    expect(EASE(-5)).toBe(0);
    expect(EASE(5)).toBe(1);
  });

  it("is monotonically non-decreasing across the range", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i += 1) {
      const y = EASE(i / 100);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it("front-loads like an ease-out: past halfway by a quarter of the time", () => {
    // 0.16,1,0.3,1 is a strong ease-out — this is the property that makes a count-up read as
    // decelerating rather than linear. If someone swaps the control points, this catches it.
    expect(EASE(0.25)).toBeGreaterThan(0.5);
    expect(EASE(0.5)).toBeGreaterThan(0.8);
  });

  it("linear control points behave linearly", () => {
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(linear(t)).toBeCloseTo(t, 3);
    }
  });
});

describe("tween", () => {
  it("LANDS EXACTLY on the target - never 0.9999 of it", () => {
    setupRaf();
    const seen: number[] = [];
    tween({ from: 0, to: 42, durationMs: 800, ease: EASE, onUpdate: (v) => seen.push(v) });
    step(0);
    step(400);
    step(800);
    expect(seen.at(-1)).toBe(42); // exact, not close
    expect(pending.size).toBe(0); // and it stopped scheduling
  });

  it("starts from `from`, not from zero", () => {
    setupRaf();
    const seen: number[] = [];
    tween({ from: 23, to: 24, durationMs: 800, ease: EASE, onUpdate: (v) => seen.push(v) });
    step(0);
    step(400);
    step(800);
    expect(seen[0]).toBe(23);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(23);
    expect(seen.at(-1)).toBe(24);
  });

  it("never overshoots the target mid-flight", () => {
    setupRaf();
    const seen: number[] = [];
    tween({ from: 0, to: 10, durationMs: 800, ease: EASE, onUpdate: (v) => seen.push(v) });
    for (const t of [0, 100, 200, 400, 600, 800]) step(t);
    expect(Math.max(...seen)).toBe(10);
  });

  it("stop() halts it - no half-counted number keeps ticking after unmount", () => {
    setupRaf();
    const seen: number[] = [];
    const c = tween({ from: 0, to: 100, durationMs: 5000, ease: EASE, onUpdate: (v) => seen.push(v) });
    step(0);
    step(1000);
    const countAtStop = seen.length;
    c.stop();
    step(2000);
    step(3000);
    expect(seen.length).toBe(countAtStop);
    expect(seen.at(-1)).not.toBe(100); // it really was interrupted mid-flight
  });

  it("a zero duration reports the final value on the first frame", () => {
    setupRaf();
    const seen: number[] = [];
    tween({ from: 0, to: 7, durationMs: 0, ease: EASE, onUpdate: (v) => seen.push(v) });
    step(0);
    expect(seen).toEqual([7]);
    expect(pending.size).toBe(0);
  });

  it("counting DOWN works too (a corrected grade can lower a stat)", () => {
    setupRaf();
    const seen: number[] = [];
    tween({ from: 50, to: 40, durationMs: 800, ease: EASE, onUpdate: (v) => seen.push(v) });
    step(0);
    step(400);
    step(800);
    expect(seen[0]).toBe(50);
    expect(seen.at(-1)).toBe(40);
    expect(Math.min(...seen)).toBe(40);
  });
});
