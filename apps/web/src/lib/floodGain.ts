// How brightly the floodlights burn, per route and per matchday state.
//
// This is an honesty invariant, not decoration: brightness encodes "N matches are in play",
// which the API does return. It encodes no score, no minute, no side, and it is symmetric
// with respect to whether any forecast was right.
//
// The REFERENCE pages must never brighten for a live slate. styles/sections.css states
// their job: "the only two pages with no live data — every number is a static, dated fact."
// Lights that respond to tonight's fixtures on a page with no live data would be a false
// signal, so that case is a truth-table row with a test, not a comment.
const REFERENCE_PAGES = new Set(["methodology", "engineering"]);

export const GAIN_REFERENCE = 0.75;
export const GAIN_MATCHDAY = 1.18;
export const GAIN_BASE = 1;

export function floodGain(page: string, matchday: boolean): number {
  if (REFERENCE_PAGES.has(page)) return GAIN_REFERENCE; // never matchday-boosted
  return matchday ? GAIN_MATCHDAY : GAIN_BASE;
}

/** The breath runs a little quicker on a matchday — the same signal, in tempo. */
export function breathSeconds(matchday: boolean): number {
  return matchday ? 5.2 : 7;
}
