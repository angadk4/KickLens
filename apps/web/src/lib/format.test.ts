// countInt feeds count-up animations: it gets FRACTIONAL values every frame and must
// round before grouping — a bare toFixed(0) rendered 1234 with no thousands separator.
import { describe, expect, it } from "vitest";
import { countInt, teamShort } from "./format";

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

describe("teamShort", () => {
  // the chart's end labels reserve a fixed 76px right margin, so the contract is "never
  // longer than 4 characters, never empty"
  const MLS_2026 = [
    "Inter Miami", "Vancouver Whitecaps", "Nashville SC", "Los Angeles FC", "FC Cincinnati",
    "New York City", "FC Dallas", "Charlotte", "Chicago Fire", "San Diego FC",
    "Minnesota United", "San Jose Earthquakes", "Seattle Sounders", "Columbus Crew",
    "Real Salt Lake", "Orlando City", "Houston Dynamo", "Philadelphia Union", "St. Louis City",
    "Portland Timbers", "New England Revolution", "Colorado Rapids", "Los Angeles Galaxy",
    "New York Red Bulls", "Austin FC", "Toronto FC", "DC United", "CF Montreal",
    "Atlanta Utd", "Sporting Kansas City",
  ];

  it("gives every current club a distinct code of at most 4 characters", () => {
    const codes = MLS_2026.map(teamShort);
    for (const c of codes) {
      expect(c.length).toBeGreaterThan(0);
      expect(c.length).toBeLessThanOrEqual(4);
      expect(c).toBe(c.toUpperCase());
    }
    expect(new Set(codes).size).toBe(MLS_2026.length); // distinct, or two lines label alike
  });

  it("uses the standard codes people recognise", () => {
    expect(teamShort("Seattle Sounders")).toBe("SEA");
    expect(teamShort("Los Angeles FC")).toBe("LAFC");
    expect(teamShort("Los Angeles Galaxy")).toBe("LAG");
    expect(teamShort("New York Red Bulls")).toBe("RBNY");
    expect(teamShort("Sporting Kansas City")).toBe("SKC");
    expect(teamShort("Atlanta Utd")).toBe("ATL"); // via teamName's normalisation
  });

  it("falls back deterministically for a club the map has not caught up with", () => {
    // MLS added San Diego FC in 2025; this map WILL drift again
    expect(teamShort("Wrexham AFC")).toBe(teamShort("Wrexham AFC"));
    expect(teamShort("Wrexham")).toBe("WRE");
    expect(teamShort("Las Vegas Villains")).toBe("LVV");
    // generic words carry no identity: "United"/"FC" drop out, so this is SOM (from the one
    // real word) rather than SUF — otherwise half the league would label as "…FC"
    expect(teamShort("Some United FC")).toBe("SOM");
    expect(teamShort("Rio Grande Valley FC")).toBe("RGV");
    expect(teamShort("")).toBe("");
  });
});
