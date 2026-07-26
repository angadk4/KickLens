// Guards the architecture diagram's layout rule: no glyph may sit within 12px of its box
// border. Seven captions used to run out through the right-hand stroke (worst: 43px), so
// the rule is now executable — a longer label or a bigger fact (TESTS_CI_PASSED, CRON_RULES)
// fails the build instead of silently overflowing the drawing.
import { describe, expect, it } from "vitest";
import { NODES, fitsBox, textWidth } from "./diagramNodes";

describe("architecture diagram layout", () => {
  it("keeps every label inside its box", () => {
    const offenders = NODES.filter((n) => !fitsBox(n)).map((n) => n.id);
    expect(offenders).toEqual([]);
  });

  it("measures mono text at 0.6em per glyph", () => {
    expect(textWidth("abcde", 10)).toBeCloseTo(30, 5);
  });

  it("rejects a label that would overflow", () => {
    expect(fitsBox({ w: 100, h: 60, lines: ["x".repeat(40)] })).toBe(false);
  });

  it("rejects a box too short for its lines", () => {
    expect(fitsBox({ w: 400, h: 20, lines: ["a", "b", "c"] })).toBe(false);
  });

  it("never collides two boxes in the same column", () => {
    const byColumn = new Map<number, typeof NODES>();
    for (const n of NODES) {
      const col = byColumn.get(n.x) ?? [];
      col.push(n);
      byColumn.set(n.x, col);
    }
    for (const col of byColumn.values()) {
      const sorted = [...col].sort((a, b) => a.y - b.y);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].y + sorted[i - 1].h).toBeLessThanOrEqual(sorted[i].y);
      }
    }
  });
});
