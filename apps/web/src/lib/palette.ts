// The command palette's data and ranking — pure, node-testable, and deliberately DUMB.
// No fuzzy-subsequence matching: on a credibility site, "why did typing that match this?"
// is a question the reader should never have to ask. A token matches exactly, at a label
// prefix, at a word boundary, or as a substring — four tiers, in that order, and nothing
// cleverer. Multi-token queries AND together (every token must land somewhere).
import type { CompletedItem, InPlayItem, UpcomingMatch } from "../api";
import { ANCHORS_URL, REPO_URL } from "./facts";
import { dateShort, teamName, teamShort } from "./format";

export type PaletteItem = {
  id: string;
  group: "pages" | "matches" | "actions";
  label: string;
  /** short mono annotation on the row's right (a route, a date, "github ↗") */
  hint?: string;
  /** extra match targets — team codes, aliases ("elo" finds Ratings) */
  keywords?: string[];
  /** internal navigation target */
  to?: string;
  /** external target (new tab) */
  href?: string;
  /** text the component copies to the clipboard on activation */
  copyText?: string;
};

/** Lowercase + fold diacritics, so "montreal" finds CF Montréal. */
export function normalize(s: string): string {
  // U+0300–U+036F = the combining-diacritics block NFD splits accents into
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** One token against one candidate string. The ladder is the whole matching policy. */
function tierScore(token: string, candidate: string): number {
  if (candidate === token) return 100;
  if (candidate.startsWith(token)) return 80;
  const words = candidate.split(/[^a-z0-9]+/);
  if (words.some((w) => w !== "" && w.startsWith(token))) return 60;
  if (candidate.includes(token)) return 40;
  return 0;
}

/** Score an item against a query. 0 = excluded. Multi-token is an AND: the item's score
    is its WEAKEST token (a strong first word cannot smuggle in an unmatched second).
    Keywords score one notch under the same label tier, so label matches always outrank
    keyword matches at equal specificity. */
export function matchScore(query: string, item: PaletteItem): number {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const label = normalize(item.label);
  const keywords = (item.keywords ?? []).map(normalize);
  let weakest = Infinity;
  for (const token of tokens) {
    let best = tierScore(token, label);
    for (const k of keywords) {
      best = Math.max(best, tierScore(token, k) - 10);
    }
    if (best <= 0) return 0;
    weakest = Math.min(weakest, best);
  }
  return weakest;
}

/** Rank for display. Empty query = the authored order (predictable beats clever, again).
    Ties keep authored order — the sort is stable by construction. */
export function rankPalette(items: PaletteItem[], query: string): PaletteItem[] {
  if (normalize(query).trim() === "") return items;
  return items
    .map((item, i) => ({ item, i, score: matchScore(query, item) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);
}

/** The eight routed pages, with the aliases a reader would actually type. */
export const PAGE_ITEMS: PaletteItem[] = [
  { id: "page:overview", group: "pages", label: "Overview", hint: "/", to: "/", keywords: ["home", "board", "start"] },
  { id: "page:forecasts", group: "pages", label: "Forecasts", hint: "/forecasts", to: "/forecasts", keywords: ["upcoming", "fixtures", "frozen"] },
  { id: "page:record", group: "pages", label: "Record", hint: "/record", to: "/record", keywords: ["graded", "results", "history", "seal"] },
  { id: "page:performance", group: "pages", label: "Performance", hint: "/performance", to: "/performance", keywords: ["log loss", "metrics", "ladder", "baselines"] },
  { id: "page:calibration", group: "pages", label: "Calibration", hint: "/calibration", to: "/calibration", keywords: ["reliability", "ece", "temperature"] },
  { id: "page:ratings", group: "pages", label: "Ratings", hint: "/ratings", to: "/ratings", keywords: ["elo", "teams", "table", "compare"] },
  { id: "page:methodology", group: "pages", label: "Methodology", hint: "/methodology", to: "/methodology", keywords: ["how it works", "verification", "guarantees", "pipeline"] },
  { id: "page:engineering", group: "pages", label: "Engineering", hint: "/engineering", to: "/engineering", keywords: ["architecture", "invariants", "operations", "incidents"] },
];

/** Live matches, in the order a reader cares: in play now → upcoming → recently graded.
    Team CODES ride as keywords so "mia" finds Inter Miami. Dedup by match id — a match
    must never appear twice with two different states. */
export function matchItems(
  upcoming: UpcomingMatch[] | null,
  inPlay: InPlayItem[] | null,
  completed: CompletedItem[] | null,
): PaletteItem[] {
  const items: PaletteItem[] = [];
  const seen = new Set<number>();
  const add = (
    id: number,
    home: string,
    away: string,
    hint: string,
  ) => {
    if (seen.has(id)) return;
    seen.add(id);
    items.push({
      id: `match:${id}`,
      group: "matches",
      label: `${teamName(home)} vs ${teamName(away)}`,
      hint,
      to: `/match/${id}`,
      keywords: [teamShort(home), teamShort(away)],
    });
  };
  for (const m of inPlay ?? []) add(m.match_id, m.home, m.away, "in play");
  for (const m of upcoming ?? []) {
    const sealed = m.forecast?.type === "official-frozen";
    add(m.match_id, m.home, m.away, `${sealed ? "sealed" : "upcoming"} · ${dateShort(m.kickoff_utc)}`);
  }
  for (const m of completed ?? []) add(m.match_id, m.home, m.away, `graded · ${dateShort(m.kickoff_utc)}`);
  return items;
}

/** The verbs. Copy-hash only exists when there IS a latest hash — no disabled rows. */
export function actionItems(latestHash: string | null, verifyId: number | null): PaletteItem[] {
  const items: PaletteItem[] = [
    {
      id: "action:verify",
      group: "actions",
      label: "Verify a forecast",
      hint: "proof bench",
      to: verifyId !== null ? `/match/${verifyId}` : "/record",
      keywords: ["audit", "hash", "merkle", "proof", "recompute"],
    },
  ];
  if (latestHash) {
    items.push({
      id: "action:copy-hash",
      group: "actions",
      label: "Copy the latest forecast hash",
      hint: `⬡ ${latestHash.slice(0, 10)}…`,
      copyText: latestHash,
      keywords: ["sha", "clipboard"],
    });
  }
  items.push(
    {
      id: "action:anchors",
      group: "actions",
      label: "Open the public anchors",
      hint: "github ↗",
      href: ANCHORS_URL,
      keywords: ["github", "anchor", "jsonl", "public"],
    },
    {
      id: "action:source",
      group: "actions",
      label: "View the source",
      hint: "github ↗",
      href: REPO_URL,
      keywords: ["github", "repo", "code"],
    },
  );
  return items;
}

/** Is the event target something the "/" shortcut must not steal keystrokes from?
    Structural (no DOM types), so the truth table runs under node. */
export function isEditableTarget(
  t: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!t) return false;
  const tag = (t.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable === true;
}
