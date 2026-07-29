// "2h ago"-style stamps that stay fresh on a shared tick. Relative sugar never replaces
// the verifiable timestamp — render the absolute UTC time in a title attribute.
import { useCallback, useSyncExternalStore } from "react";
import { clockNow, subscribeClock } from "./clock";

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const FROZEN = Date.now(); // ms <= 0 → "never tick": a stable snapshot, no subscription

/** The shared wall-clock tick: anything derived from "how long since/until" re-renders on
    this with ZERO network — and, since lib/clock.ts, with zero timers of its own. Every
    call site with the same interval shares ONE setInterval (was: one per call site). */
export function useNow(intervalMs = 60_000): number {
  const subscribe = useCallback(
    (cb: () => void) => (intervalMs > 0 ? subscribeClock(intervalMs, cb) : () => {}),
    [intervalMs],
  );
  const snapshot = useCallback(
    () => (intervalMs > 0 ? clockNow(intervalMs) : FROZEN),
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useRelativeTime(iso: string | null | undefined): string {
  return relTime(iso, useNow());
}
