// countInt feeds count-up animations: it gets FRACTIONAL values every frame and must
// round before grouping — a bare toFixed(0) rendered 1234 with no thousands separator.
import { describe, expect, it } from "vitest";
import { countInt } from "./format";

describe("countInt", () => {
  it("groups thousands", () => {
    expect(countInt(1234)).toBe((1234).toLocaleString()); // locale-safe: "1,234" in en
  });

  it("rounds mid-animation fractions instead of truncating", () => {
    expect(countInt(1233.7)).toBe((1234).toLocaleString());
    expect(countInt(0.4)).toBe("0");
  });

  it("holds integers fixed", () => {
    expect(countInt(0)).toBe("0");
    expect(countInt(35)).toBe("35");
  });
});
