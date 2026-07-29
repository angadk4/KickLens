// The reveal policy truth table. The invariant under test: an element already on screen
// at mount NEVER animates (no page-load flash), and nothing ever waits forever once seen.
import { describe, expect, it } from "vitest";
import { inViewDecision } from "./reveal";

describe("inViewDecision", () => {
  it("visible at mount + skip policy → skip (the no-page-load-flash rule)", () => {
    expect(inViewDecision(true, true, true)).toBe("skip");
  });

  it("visible at mount + count-up policy → settle (first sight IS the moment)", () => {
    expect(inViewDecision(true, true, false)).toBe("settle");
  });

  it("offscreen at mount → wait, under either policy", () => {
    expect(inViewDecision(true, false, true)).toBe("wait");
    expect(inViewDecision(true, false, false)).toBe("wait");
  });

  it("scrolled into view later → settle, under either policy", () => {
    expect(inViewDecision(false, true, true)).toBe("settle");
    expect(inViewDecision(false, true, false)).toBe("settle");
  });

  it("still offscreen on later observations → keep waiting", () => {
    expect(inViewDecision(false, false, true)).toBe("wait");
    expect(inViewDecision(false, false, false)).toBe("wait");
  });
});
