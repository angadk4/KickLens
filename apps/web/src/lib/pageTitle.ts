// Per-route document titles. Every route served the same non-descriptive title until
// 2026-08-02, which degrades tabs, history, bookmarks and search listings — and this site is
// pitched as a public, citable record, so a reviewer with five tabs open saw "KickLens —
// tamper-evident MLS forecasts" five times.
//
// THE RULE FOR THIS FILE: a title may name the PAGE, never a NUMBER. A title carrying a
// metric ("Performance — 1.0507") would be a figure rendered without its evidence scope or
// its sample size, in the one place on the site that has no room to carry either — which is
// exactly what T-171 forbids. Titles are static strings for that reason.
const SUFFIX = "KickLens";

const TITLES: Record<string, string> = {
  "/": "KickLens — tamper-evident MLS forecasts",
  "/forecasts": `Forecasts — upcoming fixtures · ${SUFFIX}`,
  "/record": `Record — graded official forecasts · ${SUFFIX}`,
  "/performance": `Performance — four evidence scopes · ${SUFFIX}`,
  "/calibration": `Calibration — reliability and ECE · ${SUFFIX}`,
  "/ratings": `Ratings — Elo power ratings · ${SUFFIX}`,
  "/methodology": `Methodology — how it works · ${SUFFIX}`,
  "/engineering": `Engineering — how it's built · ${SUFFIX}`,
};

/** The title for a pathname. `/match/:id` is dynamic — the id alone is meaningless to a
    reader scanning tabs, and the team names aren't known until the fetch resolves, so the
    match page takes a stable generic title rather than a flickering one. Unknown paths get
    the 404's title, since that is what the router renders. */
export function titleFor(pathname: string): string {
  const exact = TITLES[pathname];
  if (exact) return exact;
  if (pathname.startsWith("/match/")) return `Match — forecast and proof · ${SUFFIX}`;
  return `Not found · ${SUFFIX}`;
}
