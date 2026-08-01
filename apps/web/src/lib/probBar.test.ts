// The outcome mark's honesty guardrails, migrated from lib/goalMark.test.ts when the goal
// mouth was retired. Four guardrails came out of that file; two are preserved verbatim, and
// the two that policed the goal's NET THRESHOLD are replaced by something stronger.
//
// The old pair rate-limited celebration: "the knew-nothing baseline never rings the net" and
// "the threshold stays above a coin flip" — i.e. the bar for a celebratory flourish is set
// high, and lowering it fails a test. The new pair removes the category instead: everything
// the mark renders is a pure function of `result` ALONE (NO-VERDICT), and the source contains
// no correctness vocabulary or semantic colour token at all (NO CHANNEL). There is no bar to
// lower because there is nothing to celebrate with.
import { describe, expect, it } from "vitest";
// ?raw works for .ts/.tsx under Vitest but returns "" for .css — see the non-vacuity check
// below, which exists because three assertions in pitchBall.test.ts once passed on empty input
import probBarSrc from "./probBar.ts?raw";
import barSrc from "../components/ui/ProbBar.tsx?raw";
import { markedIndex, outcomeMark, pActual, segments, type Outcome } from "./probBar";

const OUTCOMES: Outcome[] = ["H", "D", "A"];

describe("the bar's cells", () => {
  it("are the fixed H|D|A order, with the probabilities given", () => {
    const c = segments(0.579, 0.26, 0.161);
    expect(c.map((s) => s.label)).toEqual(["H", "D", "A"]);
    expect(c.map((s) => s.key)).toEqual(["home", "draw", "away"]);
    expect(c.map((s) => s.p)).toEqual([0.579, 0.26, 0.161]);
  });

  it("floor a vanishing outcome to a hairline rather than collapsing it", () => {
    const c = segments(0.98, 0.02, 0);
    expect(c[2]!.grow).toBe(0.001);
    expect(c[2]!.p).toBe(0); // the DATUM is untouched — only the flex weight is floored
  });
});

describe("p(actual) — preserved from the goal mark", () => {
  const probs = { p_home: 0.5, p_draw: 0.3, p_away: 0.2 };

  it("picks the component the result names", () => {
    expect(pActual(probs, "H")).toBe(0.5);
    expect(pActual(probs, "D")).toBe(0.3);
    expect(pActual(probs, "A")).toBe(0.2);
  });

  it("is e^−log_loss — the identity that lets the rule and the chip be one claim", () => {
    // the rule prints the FROZEN probability; the chip prints the GRADED log loss. This is
    // why printing both is not printing two different numbers.
    for (const result of OUTCOMES) {
      const p = pActual(probs, result);
      const logLoss = -Math.log(p); // how the grade is computed server-side
      expect(Math.exp(-logLoss)).toBeCloseTo(p, 12);
    }
  });
});

describe("GUARDRAIL: no verdict", () => {
  // Replaces `isGoal(1/3) === false`. That test forbade ONE threshold being too low; this
  // forbids every threshold, because there is no output that could carry one.
  it("everything rendered is a pure function of `result`, never of whether we were right", () => {
    for (const result of OUTCOMES) {
      // same result, probabilities permuted so the actual outcome goes from top pick to
      // bottom pick — a triumph and a humiliation, rendered
      const best = outcomeMark(0.7, 0.2, 0.1, result === "H" ? "H" : result === "D" ? "D" : "A");
      const worst = outcomeMark(0.1, 0.2, 0.7, result === "H" ? "H" : result === "D" ? "D" : "A");
      // the marked cell is the same cell, and the caption differs ONLY in its number
      expect(best.index).toBe(worst.index);
      expect(best.cells[best.index]!.key).toBe(worst.cells[worst.index]!.key);
      expect(best.caption.replace(/[\d.]+%/, "")).toBe(worst.caption.replace(/[\d.]+%/, ""));
    }
  });

  it("the marked cell depends on the result and nothing else", () => {
    expect(markedIndex("H")).toBe(0);
    expect(markedIndex("D")).toBe(1);
    expect(markedIndex("A")).toBe(2);
    // whatever the probabilities, an away win marks the away cell
    for (const [h, d, a] of [
      [0.9, 0.05, 0.05],
      [0.05, 0.05, 0.9],
      [1 / 3, 1 / 3, 1 / 3],
    ]) {
      expect(outcomeMark(h!, d!, a!, "A").cells[outcomeMark(h!, d!, a!, "A").index]!.key).toBe(
        "away",
      );
    }
  });
});

describe("GUARDRAIL: no channel", () => {
  // Replaces `goalThreshold() > 0.5`. Enforced at the SOURCE, so a future edit cannot quietly
  // reintroduce a correctness signal without this failing.
  it("the sources actually loaded (never let the checks below pass on empty input)", () => {
    expect(probBarSrc.length).toBeGreaterThan(500);
    expect(barSrc.length).toBeGreaterThan(500);
  });

  it("the mark's code contains no correctness vocabulary and no semantic colour", () => {
    // Comments explain WHY these words are banned, so they must not trip their own test.
    // A line-prefix filter is not enough: this repo's JSDoc continuation lines are indented
    // plain text, so `/** … correctness signal … */` survived it and failed the check.
    const strip = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "") // block comments, including JSDoc
        .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line comments, but not the // in a URL
    const code = strip(`${probBarSrc}\n${barSrc}`);
    // …and the stripper itself must not have eaten the code, or this passes on nothing
    expect(code).toContain("outcomeMark");
    expect(code).toContain("probbar-caption");
    expect(code.length).toBeGreaterThan(800);
    for (const banned of [
      "correct",
      "--success",
      "--danger",
      "--warn",
      "--gold",
      "isGoal",
      "threshold",
    ]) {
      expect(code).not.toContain(banned);
    }
  });

  it("writes no per-card custom property — the old --gm-from has no successor", () => {
    // the goal mark set --gm-from per card to drive its roll. The rule's colour comes from the
    // cell's own key class, so there is no per-card style hook to animate or to key off.
    expect(barSrc).not.toContain('" as string]');
    const mark = outcomeMark(0.5, 0.3, 0.2, "H");
    expect(JSON.stringify(mark)).not.toContain("--");
  });
});

describe("GUARDRAIL: mirror invariance", () => {
  // Replaces "equidistant p's travel equal distances". That was a property of an ANIMATION;
  // this is a property of the static render, so it cannot be broken by adding motion later.
  it("a 20% home win and a 20% away win render identically apart from position", () => {
    const home = outcomeMark(0.2, 0.3, 0.5, "H");
    const away = outcomeMark(0.5, 0.3, 0.2, "A");
    expect(home.p).toBe(away.p);
    expect(home.cells[home.index]!.grow).toBe(away.cells[away.index]!.grow);
    // mirror images: cell weights reversed
    expect(home.cells.map((c) => c.grow)).toEqual([...away.cells.map((c) => c.grow)].reverse());
    // same template, same number, only the outcome word differs
    expect(home.caption.replace("home win", "X")).toBe(away.caption.replace("away win", "X"));
  });

  it("a forecast that beat the baseline and one that lost to it are equally loud", () => {
    const beat = outcomeMark(0.48, 0.32, 0.2, "H"); // ⅓ + 0.1467
    const lost = outcomeMark(0.1867, 0.32, 0.4933, "H"); // ⅓ − 0.1467
    expect(beat.index).toBe(lost.index);
    expect(beat.caption.split("·")[0]).toBe(lost.caption.split("·")[0]);
  });
});

describe("GUARDRAIL: agreement and alignment", () => {
  it("the caption's number IS the marked cell's probability", () => {
    // the card can never print a figure the bar contradicts — the class of bug that made the
    // goal mark switch to e^−log_loss, closed here by construction instead
    for (const result of OUTCOMES) {
      const m = outcomeMark(0.579, 0.26, 0.161, result);
      expect(m.p).toBe(m.cells[m.index]!.p);
      expect(m.caption).toContain(`${(m.p * 100).toFixed(1)}%`);
    }
  });

  it("the mark row's weights ARE the bar's weights", () => {
    // one segments() call feeds both rows, so a rule cannot drift off its segment
    const m = outcomeMark(0.579, 0.26, 0.161, "A");
    expect(m.cells.map((c) => c.grow)).toEqual(segments(0.579, 0.26, 0.161).map((c) => c.grow));
  });

  it("names the outcome in words, so colour is never the only channel", () => {
    expect(outcomeMark(0.5, 0.3, 0.2, "H").caption).toContain("home win");
    expect(outcomeMark(0.5, 0.3, 0.2, "D").caption).toContain("draw");
    expect(outcomeMark(0.5, 0.3, 0.2, "A").caption).toContain("away win");
  });
});
