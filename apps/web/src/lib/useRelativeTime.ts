// "2h ago"-style stamps that stay fresh on a 60s tick. Relative sugar never replaces
// the verifiable timestamp — render the absolute UTC time in a title attribute.
import { useEffect, useState } from "react";

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

/** The shared wall-clock tick: anything derived from "how long since/until" re-renders on
    this with ZERO network — it's how phase labels age past boundaries in an open tab. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useRelativeTime(iso: string | null | undefined): string {
  return relTime(iso, useNow());
}
