// The scoreboard-not-slot-machine contract: duration is proportional to distance, and
// first paint never animates.
import { describe, expect, it } from "vitest";
import { FLAP_MS_MAX, flapDigits, flapDuration, flapPlan } from "./flap";

describe("flapPlan", () => {
  it("FIRST PAINT never animates — every column is still", () => {
    for (const c of flapPlan(null, "0742")) expect(c.cells).toBe(0);
    for (const c of flapPlan(null, "0742")) expect(c.durMs).toBe(0);
  });

  it("only the columns that changed move", () => {
    const plan = flapPlan("07", "08");
    expect(plan[0]?.cells).toBe(0); // the tens digit did not move
    expect(plan[1]?.cells).toBe(1);
    expect(plan[0]?.durMs).toBe(0);
  });

  it("duration grows with distance travelled, and is capped", () => {
    expect(flapDuration(1)).toBe(180);
    expect(flapDuration(9)).toBe(FLAP_MS_MAX); // 150 + 270 = 420, exactly the cap
    expect(flapDuration(9)).toBeGreaterThan(flapDuration(1));
    expect(flapDuration(0)).toBe(0);
    expect(flapDuration(-3)).toBe(0);
  });

  it("the 9→0 wrap is the long run of the reels", () => {
    const plan = flapPlan("19", "20");
    expect(plan[1]?.cells).toBe(9);
    expect(plan[1]?.durMs).toBe(FLAP_MS_MAX);
  });

  it("digits always render the value they were given", () => {
    expect(flapPlan("00", "42").map((c) => c.digit)).toEqual([4, 2]);
  });

  it("a WIDTH change is completely still — the columns changed meaning, nothing travelled", () => {
    // 9 → 10: position 0 stops being the units digit and becomes the tens digit. Comparing
    // positionally would claim a digit ran 8 cells, which is a lie about what happened.
    for (const c of flapPlan("9", "10")) expect(c.cells).toBe(0);
    for (const c of flapPlan("100", "99")) expect(c.cells).toBe(0);
    expect(flapPlan("9", "10").map((c) => c.digit)).toEqual([1, 0]); // value still correct
  });

  it("identical values are completely still", () => {
    for (const c of flapPlan("1234", "1234")) expect(c.durMs).toBe(0);
  });
});

describe("flapDigits", () => {
  it("pads to the column count", () => {
    expect(flapDigits(7, 2)).toBe("07");
    expect(flapDigits(0, 2)).toBe("00");
  });

  it("never truncates a value wider than the pad", () => {
    expect(flapDigits(1234, 2)).toBe("1234");
  });

  it("floors and floors at zero — a countdown must not render a negative", () => {
    expect(flapDigits(7.9, 2)).toBe("07");
    expect(flapDigits(-5, 2)).toBe("00");
    expect(flapDigits(Number.NaN, 2)).toBe("00");
  });
});
