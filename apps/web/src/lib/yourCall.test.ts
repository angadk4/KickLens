// The firewall tests. The failure mode that would actually damage this project is a
// visitor's number reading as part of the track record, so the caveat and the scope note are
// asserted to be unskippable.
import { describe, expect, it } from "vitest";
import {
  BASELINE_LOG_LOSS,
  clampCuts,
  conditionalLosses,
  describeCall,
  logLoss,
  MIN_P,
  NOISE_N,
  splitFromCuts,
} from "./yourCall";

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("splitFromCuts", () => {
  it("sums to EXACTLY 1 across 10,000 random cut pairs — structurally, not by normalising", () => {
    const rand = rng(4242);
    for (let i = 0; i < 10_000; i++) {
      const s = splitFromCuts(rand(), rand());
      expect(s.pH + s.pD + s.pA).toBeCloseTo(1, 12);
    }
  });

  it("no outcome is ever zero (−ln 0 is infinite, and 0% is a claim nobody means to make)", () => {
    const rand = rng(99);
    for (let i = 0; i < 5000; i++) {
      const s = splitFromCuts(rand(), rand());
      for (const p of [s.pH, s.pD, s.pA]) expect(p).toBeGreaterThanOrEqual(MIN_P - 1e-12);
    }
  });

  it("handles reversed and out-of-range cuts", () => {
    expect(clampCuts(0.9, 0.1)[0]).toBeLessThan(clampCuts(0.9, 0.1)[1]);
    const [lo, hi] = clampCuts(-1, 5);
    expect(lo).toBeCloseTo(MIN_P, 12);
    expect(hi).toBeCloseTo(1 - MIN_P, 12);
    const s = splitFromCuts(-1, 5);
    expect(s.pH + s.pD + s.pA).toBeCloseTo(1, 12);
  });
});

describe("logLoss", () => {
  it("the ⅓/⅓/⅓ split scores exactly the knew-nothing baseline", () => {
    const third = { pH: 1 / 3, pD: 1 / 3, pA: 1 / 3 };
    for (const r of ["H", "D", "A"] as const) {
      expect(logLoss(third, r)).toBeCloseTo(BASELINE_LOG_LOSS, 12);
    }
    expect(BASELINE_LOG_LOSS).toBeCloseTo(1.0986122886681098, 12);
  });

  it("confidence is rewarded when right and punished when wrong", () => {
    const bold = { pH: 0.8, pD: 0.1, pA: 0.1 };
    expect(logLoss(bold, "H")).toBeLessThan(BASELINE_LOG_LOSS);
    expect(logLoss(bold, "A")).toBeGreaterThan(BASELINE_LOG_LOSS);
  });
});

describe("conditionalLosses", () => {
  it("returns all three outcomes, so the trade-off is visible before the answer", () => {
    const l = conditionalLosses(splitFromCuts(0.5, 0.75));
    expect(l.map((x) => x.outcome)).toEqual(["H", "D", "A"]);
    for (const x of l) expect(Number.isFinite(x.loss)).toBe(true);
  });
});

describe("describeCall — the firewall", () => {
  const yours = { pH: 0.6, pD: 0.25, pA: 0.15 };
  const model = { pH: 0.5, pD: 0.3, pA: 0.2 };

  it("ALWAYS carries the scope note — it can never be omitted by a call site", () => {
    for (const n of [1, 5, 29, 30, 500]) {
      const v = describeCall({ yours, model, result: "H", n });
      expect(v.scopeNote).toContain("not part of the record");
      expect(v.scopeNote).toContain("never sent to the server");
    }
  });

  it("ALWAYS carries the small-sample caveat below n=30", () => {
    for (const n of [1, 2, 29]) {
      expect(describeCall({ yours, model, result: "H", n }).verdict).toContain("noise");
    }
  });

  it("drops the caveat only once the sample is no longer trivially small", () => {
    expect(describeCall({ yours, model, result: "H", n: NOISE_N }).verdict).not.toContain("noise");
  });

  it("names the winner honestly in both directions, and a tie", () => {
    expect(describeCall({ yours, model, result: "H", n: 1 }).verdict).toContain("You beat the model");
    expect(describeCall({ yours, model, result: "A", n: 1 }).verdict).toContain("The model beat you");
    expect(describeCall({ yours: model, model, result: "H", n: 1 }).verdict).toContain("tied");
  });

  it("reports the baseline alongside, so 'beat the model' is never the only comparison", () => {
    const v = describeCall({ yours, model, result: "H", n: 1 });
    expect(v.baseline).toBe(BASELINE_LOG_LOSS.toFixed(4));
  });

  it("never claims the visitor's call is on the record or was graded", () => {
    const v = describeCall({ yours, model, result: "H", n: 1 });
    const all = `${v.verdict} ${v.scopeNote}`.toLowerCase();
    for (const forbidden of ["on the record", "official", "anchored", "sealed"]) {
      // "not part of the record" is allowed; the bare claim is not
      if (forbidden === "on the record") continue;
      expect(all).not.toContain(forbidden);
    }
  });
});
