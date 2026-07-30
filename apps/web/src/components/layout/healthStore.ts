// /health used to be fetched EXACTLY ONCE at App mount and never again, so on a long-open
// tab "results ingested 4h ago" aged without ever refreshing — stale but confident, which is
// the opposite of this product's thesis. It now rides the shared matchday poll in
// UpcomingContext.
//
// A module store rather than context, read through useSyncExternalStore (the same pattern
// lib/clock.ts uses): only components that actually read health re-render when it changes.
// Putting it in a provider high in the tree would re-render every page on every poll.
import { useSyncExternalStore } from "react";
import type { Health } from "../../api";

export type HealthSnapshot = { health: Health | null; apiDown: boolean };

let snapshot: HealthSnapshot = { health: null, apiDown: false };
const listeners = new Set<() => void>();

export function setHealth(next: HealthSnapshot): void {
  // Identical payloads must not invalidate: getSnapshot has to return a referentially stable
  // value or useSyncExternalStore re-renders forever.
  //
  // Compare the WHOLE payload, not a hand-listed subset. The first version enumerated four
  // fields and therefore silently swallowed a change to any other one (last_grade among them),
  // which is exactly the kind of staleness this store exists to fix. A structural compare
  // cannot fall out of date when the API adds a field.
  if (next.apiDown === snapshot.apiDown && sameHealth(next.health, snapshot.health)) return;
  snapshot = next;
  for (const fn of listeners) fn();
}

function sameHealth(a: Health | null, b: Health | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): HealthSnapshot {
  return snapshot;
}

export function useHealthStore(): HealthSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
