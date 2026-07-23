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
  // UTC-pinned like dateShort: day groups must agree with the record, the in-play band,
  // and the UTC-dated public anchor files — a local-zone date reads a day off for late
  // kickoffs and made the same fixture jump a calendar day between page sections
  return new Date(iso)
    .toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
}

export function dateShort(iso: string | null): string {
  if (!iso) return "—";
  // UTC-pinned: a local-zone date under a UTC-labelled system can read a day off
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function compactInt(n: number): string {
  return n.toLocaleString();
}

/** Display-name normalization: raw provider strings never leak to the screen. */
const TEAM_NAMES: Record<string, string> = {
  "Atlanta Utd": "Atlanta United",
};

export function teamName(t: string): string {
  return TEAM_NAMES[t] ?? t;
}

/** Human phrase for a Voided event's reason (prediction_event details.reason) so a voided
    forecast reads honestly — "match postponed", not a generic "superseded"/"fixture changed". */
const VOID_PHRASE: Record<string, string> = {
  postponed: "match postponed",
  cancelled: "match cancelled",
  abandoned: "match abandoned",
  "kickoff moved": "kickoff moved",
};

export function voidPhrase(reason: string | null | undefined): string {
  return (reason && VOID_PHRASE[reason]) || "";
}

/** The T-3h cutoff for a kickoff ISO string — the moment the forecast's inputs lock. */
export function cutoffOf(kickoffIso: string): Date {
  return new Date(new Date(kickoffIso).getTime() - 3 * 3600 * 1000);
}

/** The first hourly inference run (:20 past the hour, UTC) at or after a cutoff — when the
    official forecast is actually written, hashed, and anchored (the FROZEN record appears). */
export function freezeRunOf(cutoff: Date): Date {
  const d = new Date(cutoff);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(20);
  if (d.getTime() < cutoff.getTime()) d.setUTCHours(d.getUTCHours() + 1);
  return d;
}
