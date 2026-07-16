// Formatting helpers — all data numerals render in the mono face via CSS.

export function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function nats(x: number): string {
  return x.toFixed(4);
}

export function shortHash(h: string, n = 16): string {
  return h.length <= n ? h : `${h.slice(0, n)}…`;
}

export function kickoffLocal(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function kickoffUTC(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function timeLocal(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function dayHeading(iso: string): string {
  return new Date(iso)
    .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

export function dateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function compactInt(n: number): string {
  return n.toLocaleString();
}

/** The T-3h cutoff for a kickoff ISO string. */
export function cutoffOf(kickoffIso: string): Date {
  return new Date(new Date(kickoffIso).getTime() - 3 * 3600 * 1000);
}
