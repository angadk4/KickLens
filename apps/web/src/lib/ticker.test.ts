// The crawl rate is a policy, not a magic number: duration must follow measured WIDTH, so
// long and short item sets scroll at the same speed.
import { describe, expect, it } from "vitest";
import {
  TICKER_FALLBACK_S,
  TICKER_MAX_S,
  TICKER_MIN_S,
  TICKER_PX_PER_S,
  tickerDuration,
} from "./ticker";

describe("tickerDuration", () => {
  it("holds the rate invariant: width / duration === the rate", () => {
    for (const w of [900, 2590, 4000]) {
      const d = tickerDuration(w);
      expect(w / d).toBeCloseTo(TICKER_PX_PER_S, 6);
    }
  });

  it("is faster than the 31 px/s it replaced", () => {
    expect(TICKER_PX_PER_S).toBeGreaterThan(60); // below ~60 a crawl reads as stalled
  });

  it("clamps at both ends", () => {
    expect(tickerDuration(10)).toBe(TICKER_MIN_S);
    expect(tickerDuration(1_000_000)).toBe(TICKER_MAX_S);
  });

  it("falls back when the width is not measurable yet", () => {
    expect(tickerDuration(0)).toBe(TICKER_FALLBACK_S);
    expect(tickerDuration(-5)).toBe(TICKER_FALLBACK_S);
    expect(tickerDuration(Number.NaN)).toBe(TICKER_FALLBACK_S);
  });

  it("a wider set takes proportionally longer, so the SPEED is constant", () => {
    expect(tickerDuration(2000)).toBeCloseTo(tickerDuration(1000) * 2, 6);
  });

  it("guards a nonsense rate", () => {
    expect(tickerDuration(2000, 0)).toBe(TICKER_FALLBACK_S);
  });
});
