// The load-bearing row is the reference-page one: a page with NO live data must not
// brighten because live matches exist elsewhere. That would be atmosphere making a claim
// the page cannot support.
import { describe, expect, it } from "vitest";
import { breathSeconds, floodGain, GAIN_BASE, GAIN_MATCHDAY, GAIN_REFERENCE } from "./floodGain";

describe("floodGain", () => {
  it("HONESTY: a reference page never brightens for a live slate", () => {
    expect(floodGain("methodology", true)).toBe(GAIN_REFERENCE);
    expect(floodGain("engineering", true)).toBe(GAIN_REFERENCE);
  });

  it("reference pages sit a step darker than the board, matchday or not", () => {
    expect(floodGain("methodology", false)).toBe(GAIN_REFERENCE);
    expect(GAIN_REFERENCE).toBeLessThan(GAIN_BASE);
  });

  it("live-data pages brighten on a matchday", () => {
    expect(floodGain("home", true)).toBe(GAIN_MATCHDAY);
    expect(floodGain("record", true)).toBe(GAIN_MATCHDAY);
    expect(floodGain("forecasts", true)).toBe(GAIN_MATCHDAY);
    expect(GAIN_MATCHDAY).toBeGreaterThan(GAIN_BASE);
  });

  it("live-data pages sit at the base gain off-matchday", () => {
    expect(floodGain("home", false)).toBe(GAIN_BASE);
    expect(floodGain("record", false)).toBe(GAIN_BASE);
  });

  it("an unknown page is treated as a board page, not a reference page", () => {
    expect(floodGain("something-new", false)).toBe(GAIN_BASE);
    expect(floodGain("", false)).toBe(GAIN_BASE);
  });

  it("the breath quickens on a matchday and never stops", () => {
    expect(breathSeconds(true)).toBeLessThan(breathSeconds(false));
    expect(breathSeconds(true)).toBeGreaterThan(0);
  });
});
