// The invariant that was broken in production: a READ must not mutate. If it does, a
// double-invoked render sees the flag its own first pass wrote and suppresses the very
// animation it was deciding about (this killed the hero cascade in dev on every reload).
import { describe, expect, it } from "vitest";
import { markSeen, seenThisSession } from "./oncePerSession";

function fakeStore() {
  const data = new Map<string, string>();
  const calls = { get: 0, set: 0 };
  return {
    calls,
    getItem: (k: string) => {
      calls.get++;
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      calls.set++;
      data.set(k, v);
    },
  };
}

describe("oncePerSession", () => {
  it("the read performs ZERO writes", () => {
    const s = fakeStore();
    seenThisSession("k", s);
    expect(s.calls.set).toBe(0);
  });

  it("two consecutive reads agree — the double-invoke safety property", () => {
    const s = fakeStore();
    expect(seenThisSession("k", s)).toBe(false);
    expect(seenThisSession("k", s)).toBe(false); // StrictMode's second pass
  });

  it("only an explicit mark flips it", () => {
    const s = fakeStore();
    expect(seenThisSession("k", s)).toBe(false);
    markSeen("k", s);
    expect(seenThisSession("k", s)).toBe(true);
  });

  it("marking twice is idempotent", () => {
    const s = fakeStore();
    markSeen("k", s);
    markSeen("k", s);
    expect(seenThisSession("k", s)).toBe(true);
  });

  it("a throwing store reads as SEEN — the finished state, never a stuck animation", () => {
    const bad = {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("private mode");
      },
    };
    expect(seenThisSession("k", bad)).toBe(true);
    expect(() => markSeen("k", bad)).not.toThrow();
  });

  it("a null store (no storage at all) reads as SEEN", () => {
    expect(seenThisSession("k", null)).toBe(true);
    expect(() => markSeen("k", null)).not.toThrow();
  });

  it("keys are independent", () => {
    const s = fakeStore();
    markSeen("a", s);
    expect(seenThisSession("a", s)).toBe(true);
    expect(seenThisSession("b", s)).toBe(false);
  });
});
