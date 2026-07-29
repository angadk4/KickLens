// The shared clock is a perf guarantee: N subscribers on one interval length must cost
// exactly ONE setInterval (useNow used to create one per call site — ~17 on home).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clockNow, subscribeClock } from "./clock";

describe("clock registry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("N subscribers on the same interval share ONE timer", () => {
    const calls: number[] = [];
    const unsubs = [0, 1, 2].map((i) =>
      subscribeClock(1000, () => {
        calls.push(i);
      }),
    );
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(calls.sort()).toEqual([0, 1, 2]); // one tick fans out to every subscriber
    for (const u of unsubs) u();
  });

  it("last unsubscribe clears the interval; resubscribe restarts it", () => {
    const u1 = subscribeClock(1000, () => {});
    const u2 = subscribeClock(1000, () => {});
    u1();
    expect(vi.getTimerCount()).toBe(1); // still one live subscriber
    u2();
    expect(vi.getTimerCount()).toBe(0); // page idle → zero timers
    const u3 = subscribeClock(1000, () => {});
    expect(vi.getTimerCount()).toBe(1);
    u3();
  });

  it("distinct interval lengths get distinct buckets", () => {
    const uA = subscribeClock(1000, () => {});
    const uB = subscribeClock(60_000, () => {});
    expect(vi.getTimerCount()).toBe(2);
    uA();
    uB();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clockNow is stable between ticks (getSnapshot contract) and advances on tick", () => {
    const u = subscribeClock(1000, () => {});
    const before = clockNow(1000);
    expect(clockNow(1000)).toBe(before); // repeated reads: same value, no fresh Date.now()
    vi.advanceTimersByTime(1000);
    expect(clockNow(1000)).toBe(before + 1000);
    u();
  });

  it("a resubscribed idle bucket gets a fresh baseline, not the stale cached now", () => {
    const u1 = subscribeClock(500, () => {});
    u1(); // bucket idles with its old `now`
    const stale = clockNow(500);
    vi.setSystemTime(Date.now() + 3_600_000); // an hour passes with no subscribers
    const u2 = subscribeClock(500, () => {});
    expect(clockNow(500)).toBe(stale + 3_600_000); // fresh baseline on first subscribe
    u2();
  });
});
