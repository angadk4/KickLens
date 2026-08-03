// SYMMETRY IS THE WHOLE POINT. The top-pick verdict has shipped lopsided twice: a green
// `.badge.ok` with no red twin, and a `✓ top pick hit` whose `✗` counterpart never existed
// (`git log -S'✗'` returns exactly one hit in the repo's history — a comment describing a
// pair that was never built). Accuracy is diagnostic-only, so the honest options are a
// SYMMETRIC pair or none; these tests make "none" and "symmetric" the only reachable states.
import { describe, expect, it } from "vitest";
// ?raw needs a non-vacuity guard — .css?raw returns "" under Vitest and once made three
// assertions in pitchBall.test.ts pass on empty input
import verdictSrc from "./verdict.ts?raw";
import stampSrc from "../components/ui/Verdict.tsx?raw";
import { verdictOf } from "./verdict";

const HIT = verdictOf(true);
const MISS = verdictOf(false);

describe("GUARDRAIL: the two poles are structurally identical", () => {
  it("carry exactly the same keys", () => {
    expect(Object.keys(HIT).sort()).toEqual(Object.keys(MISS).sort());
  });

  it("every field is a non-empty string on BOTH poles — no pole may be silent", () => {
    for (const [name, v] of [
      ["hit", HIT],
      ["miss", MISS],
    ] as const) {
      for (const [key, value] of Object.entries(v)) {
        expect(typeof value, `${name}.${key}`).toBe("string");
        expect((value as string).length, `${name}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("the visible words are the same order of magnitude — one pole cannot shout", () => {
    // "HIT" (3) vs "MISS" (4) is fine; "✓ WINNER" vs "" is what this forbids
    expect(Math.abs(HIT.word.length - MISS.word.length)).toBeLessThanOrEqual(2);
    expect(HIT.word).toBe(HIT.word.toUpperCase());
    expect(MISS.word).toBe(MISS.word.toUpperCase());
  });

  it("neither pole carries a glyph — a tick or cross is a verdict by another route", () => {
    // T-279 removed a one-sided ✓ for exactly this reason. Words only, both poles.
    for (const v of [HIT, MISS]) {
      expect(v.word).toMatch(/^[A-Z]+$/);
      expect(`${v.word}${v.label}`).not.toMatch(/[✓✗✕×√]/);
    }
  });
});

describe("GUARDRAIL: colour is never the only channel", () => {
  it("both poles ship a visible word", () => {
    expect(HIT.word).toBe("HIT");
    expect(MISS.word).toBe("MISS");
  });

  it("both poles ship a non-colour fill distinction (solid vs outline)", () => {
    expect(HIT.fillClass).not.toBe(MISS.fillClass);
  });

  it("the accessible name always says TOP PICK, never a bare 'hit'/'miss'", () => {
    // "top pick hit" is the accurate claim; "hit" alone would read as "the forecast was
    // right", which is precisely the overstatement accuracy-is-diagnostic-only guards against
    for (const v of [HIT, MISS]) {
      expect(v.label).toContain("top pick");
      expect(v.title.toLowerCase()).toContain("highest probability");
    }
  });

  it("the edge classes differ, so the accelerator can be styled per pole", () => {
    expect(HIT.edgeClass).not.toBe(MISS.edgeClass);
  });
});

describe("GUARDRAIL: a pure function of `correct`", () => {
  it("same input, same object — no time, no probabilities, no thresholds", () => {
    expect(verdictOf(true)).toEqual(verdictOf(true));
    expect(verdictOf(false)).toEqual(verdictOf(false));
    expect(verdictOf(true)).not.toEqual(verdictOf(false));
  });

  it("nothing in the source reads a probability or a threshold", () => {
    expect(verdictSrc.length).toBeGreaterThan(500);
    expect(stampSrc.length).toBeGreaterThan(200);
    const strip = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const code = strip(`${verdictSrc}\n${stampSrc}`);
    // the stripper must not have eaten everything, or this passes on nothing
    expect(code).toContain("verdictOf");
    expect(code.length).toBeGreaterThan(400);
    for (const banned of ["p_home", "p_draw", "p_away", "log_loss", "threshold", "isGoal"]) {
      expect(code, `verdict must not read ${banned}`).not.toContain(banned);
    }
  });
});

describe("GUARDRAIL: the bar is left alone", () => {
  it("the stamp does not live inside ProbBar", async () => {
    // probBar.test.ts enforces a source-level ban on `correct` / semantic colour tokens
    // inside probBar.ts + ProbBar.tsx. The verdict belongs to the CARD, never the bar —
    // if a future refactor moves it in, that suite fails and so should this one.
    const bar = (await import("../components/ui/ProbBar.tsx?raw")).default;
    expect(bar.length).toBeGreaterThan(500);
    expect(bar).not.toContain("verdictOf");
    expect(bar).not.toContain("Verdict");
  });
});
