// A tiny module-level emitter for live events. Deliberately NOT React context: a takeover
// mounting must not re-render every page (the same call the repo made when it extracted
// HealthBanners into a leaf). Publishers are callbacks inside UpcomingContext's fetch; the
// only subscriber is the ticker's takeover strap.
import type { LiveEvent } from "../../lib/liveEvents";

type Listener = (events: LiveEvent[]) => void;

const listeners = new Set<Listener>();

/** Publish a BATCH — one hourly run can freeze four fixtures and they fold into one strap. */
export function publishLive(events: LiveEvent[]): void {
  if (events.length === 0) return;
  for (const fn of listeners) fn(events);
}

export function subscribeLive(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
