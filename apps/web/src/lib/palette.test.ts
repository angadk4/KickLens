// The palette's matching policy is a PROMISE (predictable beats clever), so the tests pin
// the tiers, the AND rule, and the exclusions — plus the route-coupling check that keeps
// PAGE_ITEMS honest against main.tsx's actual router table.
import { describe, expect, it } from "vitest";
// ?raw returns "" for files that fail to resolve under some setups — non-vacuity guarded below
import mainSrc from "../main.tsx?raw";
import type { CompletedItem, InPlayItem, UpcomingMatch } from "../api";
import {
  actionItems,
  isEditableTarget,
  matchItems,
  matchScore,
  normalize,
  PAGE_ITEMS,
  rankPalette,
  type PaletteItem,
} from "./palette";

const item = (label: string, keywords: string[] = []): PaletteItem => ({
  id: `t:${label}`,
  group: "pages",
  label,
  keywords,
});

describe("normalize", () => {
  it("lowercases and folds diacritics — 'montreal' finds CF Montréal", () => {
    expect(normalize("CF Montréal")).toBe("cf montreal");
    expect(normalize("São PAULO")).toBe("sao paulo");
  });
});

describe("matchScore — the four tiers, in order", () => {
  it("exact > prefix > word-boundary > substring", () => {
    expect(matchScore("ratings", item("Ratings"))).toBe(100);
    expect(matchScore("rat", item("Ratings"))).toBe(80);
    expect(matchScore("bench", item("Proof bench"))).toBe(60);
    expect(matchScore("enc", item("Proof bench"))).toBe(40);
    expect(matchScore("xyz", item("Proof bench"))).toBe(0);
  });

  it("multi-token is an AND — a strong first word cannot carry an unmatched second", () => {
    expect(matchScore("log loss", item("Performance", ["log loss", "metrics"]))).toBeGreaterThan(0);
    expect(matchScore("log zzz", item("Performance", ["log loss", "metrics"]))).toBe(0);
  });

  it("the item's score is its weakest token", () => {
    // "proof" prefixes the label (80); "bench" is a word boundary (60) → 60 overall
    expect(matchScore("proof bench", item("Proof bench"))).toBe(60);
  });

  it("keyword matches score one notch under the same label tier", () => {
    // exact keyword (100−10) beats a label substring (40) but loses to a label exact
    expect(matchScore("elo", item("Ratings", ["elo"]))).toBe(90);
    expect(matchScore("elo", item("Elo"))).toBe(100);
  });

  it("no fuzzy subsequence — 'rtg' matches nothing in 'Ratings'", () => {
    expect(matchScore("rtg", item("Ratings"))).toBe(0);
  });
});

describe("rankPalette", () => {
  const items = [item("Overview"), item("Record"), item("Ratings", ["elo"]), item("Calibration")];

  it("empty query returns the authored order, untouched", () => {
    expect(rankPalette(items, "")).toEqual(items);
    expect(rankPalette(items, "   ")).toEqual(items);
  });

  it("ranks by score and keeps authored order on ties", () => {
    // "r" prefixes Record and Ratings equally (80) — authored order breaks the tie
    const ranked = rankPalette(items, "r");
    expect(ranked.map((i) => i.label)).toEqual(["Record", "Ratings", "Overview", "Calibration"]);
    // Overview (40, substring) and Calibration (40, substring) keep authored order
  });

  it("excludes zero-score items entirely", () => {
    const ranked = rankPalette(items, "elo");
    expect(ranked.map((i) => i.label)).toEqual(["Ratings"]);
  });
});

describe("PAGE_ITEMS ↔ the real router table (main.tsx)", () => {
  it("the source actually loaded (?raw non-vacuity guard)", () => {
    expect(mainSrc.length).toBeGreaterThan(500);
    expect(mainSrc).toContain("createBrowserRouter");
  });

  it("every palette route exists in the router", () => {
    for (const p of PAGE_ITEMS) {
      expect(p.to, `${p.label} has no route`).toBeTruthy();
      if (p.to === "/") {
        expect(mainSrc).toContain("index: true");
      } else {
        expect(mainSrc, `router has no path for ${p.to}`).toContain(`path: "${p.to!.slice(1)}"`);
      }
    }
  });

  it("aliases the vocabulary a reader would type", () => {
    expect(rankPalette(PAGE_ITEMS, "elo")[0]?.label).toBe("Ratings");
    expect(rankPalette(PAGE_ITEMS, "log loss")[0]?.label).toBe("Performance");
    expect(rankPalette(PAGE_ITEMS, "architecture")[0]?.label).toBe("Engineering");
  });
});

describe("matchItems", () => {
  const up = (id: number, home: string, away: string, frozen = false): UpcomingMatch => ({
    match_id: id,
    kickoff_utc: "2026-08-01T23:30:00+00:00",
    home,
    away,
    season: 2026,
    ...(frozen
      ? { forecast: { type: "official-frozen" as const, p_home: 0.4, p_draw: 0.3, p_away: 0.3 } }
      : {}),
  });
  const ip = (id: number, home: string, away: string): InPlayItem => ({
    match_id: id,
    kickoff_utc: "2026-08-01T20:30:00+00:00",
    home,
    away,
    season: 2026,
    status: "2H",
    forecast: { type: "official-frozen" as const, p_home: 0.4, p_draw: 0.3, p_away: 0.3 },
  });
  const done = (id: number, home: string, away: string): CompletedItem => ({
    match_id: id,
    home,
    away,
    kickoff_utc: "2026-07-25T22:30:00+00:00",
    result: "H",
    p_home: 0.5,
    p_draw: 0.3,
    p_away: 0.2,
    forecast_hash: "ab".repeat(32),
    log_loss: 0.69,
    correct: true,
  });

  it("orders in-play → upcoming → graded, with honest state hints", () => {
    const items = matchItems(
      [up(2, "FC Dallas", "Austin FC", true), up(3, "Chicago Fire", "Toronto FC")],
      [ip(1, "Inter Miami", "Nashville SC")],
      [done(4, "Seattle Sounders", "Portland Timbers")],
    );
    expect(items.map((i) => i.id)).toEqual(["match:1", "match:2", "match:3", "match:4"]);
    expect(items[0]!.hint).toBe("in play");
    expect(items[1]!.hint).toContain("sealed");
    expect(items[2]!.hint).toContain("upcoming");
    expect(items[3]!.hint).toContain("graded");
  });

  it("team codes ride as keywords — 'mia' finds Inter Miami", () => {
    const items = matchItems(null, [ip(1, "Inter Miami", "Nashville SC")], null);
    expect(rankPalette(items, "mia")[0]?.label).toContain("Inter Miami");
  });

  it("dedupes by match id — the first (most live) state wins", () => {
    const items = matchItems(
      [up(1, "Inter Miami", "Nashville SC", true)],
      [ip(1, "Inter Miami", "Nashville SC")],
      null,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.hint).toBe("in play");
  });

  it("all-null inputs produce an empty list, not a crash", () => {
    expect(matchItems(null, null, null)).toEqual([]);
  });
});

describe("actionItems", () => {
  it("copy-hash exists only when there is a hash — no disabled rows", () => {
    const withHash = actionItems("ab".repeat(32), 42);
    expect(withHash.find((i) => i.id === "action:copy-hash")?.copyText).toBe("ab".repeat(32));
    const without = actionItems(null, null);
    expect(without.find((i) => i.id === "action:copy-hash")).toBeUndefined();
  });

  it("verify targets the given match, falling back to the record", () => {
    expect(actionItems("x".repeat(64), 42).find((i) => i.id === "action:verify")?.to).toBe(
      "/match/42",
    );
    expect(actionItems(null, null).find((i) => i.id === "action:verify")?.to).toBe("/record");
  });
});

describe("isEditableTarget — the '/' shortcut's guard", () => {
  it.each([
    [{ tagName: "INPUT" }, true],
    [{ tagName: "input" }, true],
    [{ tagName: "TEXTAREA" }, true],
    [{ tagName: "SELECT" }, true],
    [{ tagName: "DIV", isContentEditable: true }, true],
    [{ tagName: "DIV" }, false],
    [{ tagName: "BUTTON" }, false],
    [null, false],
    [undefined, false],
  ] as const)("%o → %s", (target, expected) => {
    expect(isEditableTarget(target as Parameters<typeof isEditableTarget>[0])).toBe(expected);
  });
});
