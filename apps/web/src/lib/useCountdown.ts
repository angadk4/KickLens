// Client-side countdown to a fixed target — zero API traffic; ticks once per second on the
// SHARED clock (lib/clock.ts), so N mounted countdowns cost one interval, not N.
import { useMemo } from "react";
import { useNow } from "./useRelativeTime";

export type Countdown = {
  d: number;
  h: number;
  m: number;
  s: number;
  expired: boolean;
};

function diff(targetMs: number | null, now: number): Countdown {
  if (targetMs === null) return { d: 0, h: 0, m: 0, s: 0, expired: false };
  const ms = targetMs - now;
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, expired: true };
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    expired: false,
  };
}

export function useCountdown(target: Date | null): Countdown {
  const targetMs = target ? target.getTime() : null;
  // no target → interval 0 → useNow never subscribes (the old null guard, kept)
  const now = useNow(targetMs === null ? 0 : 1000);
  return useMemo(() => diff(targetMs, now), [targetMs, now]);
}
