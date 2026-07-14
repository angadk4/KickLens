// Client-side countdown to a fixed target — zero API traffic; ticks once per second.
import { useEffect, useState } from "react";

export type Countdown = {
  d: number;
  h: number;
  m: number;
  s: number;
  expired: boolean;
};

function diff(targetMs: number | null): Countdown {
  if (targetMs === null) return { d: 0, h: 0, m: 0, s: 0, expired: false };
  const ms = targetMs - Date.now();
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
  const [state, setState] = useState<Countdown>(() => diff(targetMs));

  useEffect(() => {
    setState(diff(targetMs));
    if (targetMs === null) return;
    const id = setInterval(() => setState(diff(targetMs)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  return state;
}
