// Start a route's data while the pointer is still travelling.
//
// On a scale-to-zero backend the first request of a visit pays the database wake — measured at
// 26.3s in the worst case. Nothing in the client can make that wake faster, but it can start
// EARLIER: a hover is a few hundred milliseconds of free warning, and a focus is more.
//
// Two deliberate limits, because this project runs on a 100 CU-hr/month database and waking it
// needlessly is a real cost, not a theoretical one:
//
//   1. DWELL, not hover. Sweeping the mouse across the nav to reach the palette button crosses
//      all eight links. Firing on `pointerenter` would launch every route's payload at once —
//      ~15 requests, enough to matter against both the CU-hr budget and the 20 rps gateway
//      throttle. A short rest on one link is intent; passing over it is not.
//   2. ONE payload per route — the fetch that gates the page's main content, not everything the
//      page will eventually ask for. The rest arrive on mount as they always did, deduped.
//
// requestCache.prefetch already no-ops for anything cached or in flight, so a second hover, or
// hovering the page you are already on, costs nothing.
import { paths, prefetchPath } from "../api";

/** Long enough to exclude a sweep, short enough to still beat the click. */
const DWELL_MS = 120;

/** The one request that gates each route's main content. */
const PRIMARY: Record<string, () => string> = {
  "/": () => paths.performance("test"),
  "/forecasts": () => paths.upcoming(),
  "/record": () => paths.completed(50, 0),
  "/performance": () => paths.performance("dev"),
  "/calibration": () => paths.calibration(),
  "/ratings": () => paths.ratings(40),
  "/methodology": () => paths.methodology(),
  "/engineering": () => paths.activity(48),
};

// Route CHUNK loaders, registered by main.tsx (which owns the lazy() definitions) rather than
// imported here — so this module stays free of feature imports and the tests never pull React
// page components into a node environment.
//
// Only the three chart routes are worth registering: after splitting, the other page chunks are
// 3-30 KB and arrive faster than a click, but /performance, /calibration and /ratings share a
// 333 KB recharts chunk. Pulling THAT on intent is the difference between a chart that is there
// and a chart that arrives. A blanket idle-prefetch of every chunk was tried first and removed:
// it re-added ~600 KB of parse work right after first paint and measurably raised the worst
// long task (194ms -> 263ms at 4x throttle), which is the exact symptom this pass exists to fix.
let chunkLoaders: Record<string, () => Promise<unknown>> = {};

export function registerRouteChunks(map: Record<string, () => Promise<unknown>>): void {
  chunkLoaders = map;
}

const chunkStarted = new Set<string>();

function warmChunk(to: string): void {
  if (chunkStarted.has(to)) return;
  const load = chunkLoaders[to];
  if (!load) return;
  chunkStarted.add(to);
  void load().catch(() => chunkStarted.delete(to));
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Arm the dwell timer for a route. One-shot and always cleared (docs/motion.md rule 7). */
export function warmRouteOnDwell(to: string): void {
  cancelWarm();
  const build = PRIMARY[to];
  if (!build) return;
  timer = setTimeout(() => {
    timer = null;
    prefetchPath(build());
    warmChunk(to);
  }, DWELL_MS);
}

/** Keyboard focus is unambiguous intent — no dwell needed. */
export function warmRouteNow(to: string): void {
  const build = PRIMARY[to];
  if (build) prefetchPath(build());
  warmChunk(to);
}

export function cancelWarm(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Test seam: the routes that have a warm target, so the map can't silently drift from LINKS. */
export function warmableRoutes(): string[] {
  return Object.keys(PRIMARY);
}
