// A one-shot floodlight flare, published by the hero and consumed by the backdrop.
//
// Same shape as lib/clock.ts: a module-level subscriber registry, so the hero can reach the
// fixed .floodlights layer without prop-drilling through App or putting it in context (which
// would re-render every page). It fires only when the ball strikes the chalk ring hard, so it
// is invisible unless you actually smash it — and a 12% opacity lift on a layer that already
// breathes reads as LIGHTING, not confetti.
const listeners = new Set<() => void>();

export function flare(): void {
  for (const fn of listeners) fn();
}

export function subscribeFlare(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
