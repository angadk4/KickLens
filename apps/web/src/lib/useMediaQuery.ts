// Live-subscribing media query — the ONE correct pattern for environment reads.
// A one-shot `matchMedia(...).matches` read never updates when the user flips the OS
// setting (or rotates / docks), and reading it during render is unsafe. This hook
// generalizes the pattern ArchitectureDiagram's useNarrow got right.
//
// A module-level registry, in the same shape as lib/clock.ts and layout/healthStore.ts: ONE
// MediaQueryList and ONE listener per distinct query string, with N subscribers fanning out
// from a cached boolean.
//
// The old version built a fresh MediaQueryList inside getSnapshot, which React calls at least
// once per render per hook and again on every store notification. useTilt reads two queries and
// FixtureCard calls useTilt for every card, so /forecasts was constructing ~60 MediaQueryList
// objects per render pass — each one parsing the query string and able to force style
// resolution. Behaviour is identical; only the allocation is gone.
import { useSyncExternalStore } from "react";

type Bucket = { mq: MediaQueryList; matches: boolean; listeners: Set<() => void> };

const buckets = new Map<string, Bucket>();

function supported(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function bucketFor(query: string): Bucket | null {
  if (!supported()) return null;
  let b = buckets.get(query);
  if (!b) {
    const mq = window.matchMedia(query);
    const created: Bucket = { mq, matches: mq.matches, listeners: new Set() };
    // One "change" listener for every consumer of this query, registered once. It stays for the
    // life of the page: the registry is keyed by a query string authored in source, so the set
    // is small and bounded, and tearing a bucket down on the last unsubscribe would only trade
    // this for a re-parse on the next mount.
    mq.addEventListener("change", (e) => {
      created.matches = e.matches;
      for (const fn of created.listeners) fn();
    });
    buckets.set(query, created);
    b = created;
  }
  return b;
}

function subscribe(query: string, cb: () => void): () => void {
  const b = bucketFor(query);
  if (!b) return () => {};
  b.listeners.add(cb);
  return () => {
    b.listeners.delete(cb);
  };
}

function getSnapshot(query: string): boolean {
  return bucketFor(query)?.matches ?? false;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => subscribe(query, cb),
    () => getSnapshot(query),
    () => false,
  );
}

/** Test seam only. */
export function __resetMediaQueryRegistry(): void {
  buckets.clear();
}
