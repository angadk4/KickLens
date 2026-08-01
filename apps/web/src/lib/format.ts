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

/** Integer formatter safe for mid-animation values: count-ups feed fractional numbers
    through their formatter every frame — round FIRST, then add thousands separators
    (a bare toFixed(0) rendered 1234, not 1,234). */
export function countInt(n: number): string {
  return Math.round(n).toLocaleString();
}

/** Display-name normalization: raw provider strings never leak to the screen. */
const TEAM_NAMES: Record<string, string> = {
  "Atlanta Utd": "Atlanta United",
};

export function teamName(t: string): string {
  return TEAM_NAMES[t] ?? t;
}

/** Standard club codes, for direct end-of-line labels on the ratings chart. "New England
    Revolution" is 22 characters — a legend's worth of width per line — while "NE 1712" is
    eight, which is what makes labelling every compared line affordable at all. */
const TEAM_CODES: Record<string, string> = {
  "Atlanta Utd": "ATL",
  "Austin FC": "ATX",
  "CF Montreal": "MTL",
  Charlotte: "CLT",
  "Chicago Fire": "CHI",
  "Colorado Rapids": "COL",
  "Columbus Crew": "CLB",
  "DC United": "DC",
  "FC Cincinnati": "CIN",
  "FC Dallas": "DAL",
  "Houston Dynamo": "HOU",
  "Inter Miami": "MIA",
  "Los Angeles FC": "LAFC",
  "Los Angeles Galaxy": "LAG",
  "Minnesota United": "MIN",
  "Nashville SC": "NSH",
  "New England Revolution": "NE",
  "New York City": "NYC",
  "New York Red Bulls": "RBNY",
  "Orlando City": "ORL",
  "Philadelphia Union": "PHI",
  "Portland Timbers": "POR",
  "Real Salt Lake": "RSL",
  "San Diego FC": "SD",
  "San Jose Earthquakes": "SJ",
  "Seattle Sounders": "SEA",
  "Sporting Kansas City": "SKC",
  "St. Louis City": "STL",
  "Toronto FC": "TOR",
  "Vancouver Whitecaps": "VAN",
};

/** Words that carry no identity, so the fallback never returns "FC" or "CITY". */
const GENERIC = new Set(["fc", "sc", "cf", "city", "united", "utd", "club", "the"]);

/** A club's short code. The map above WILL drift — MLS added San Diego FC in 2025 — so an
    unmapped club degrades deterministically (initials of its significant words) rather than
    rendering blank or throwing. Never longer than 4 characters, so the chart's right margin
    can be a fixed reservation. */
export function teamShort(t: string): string {
  const known = TEAM_CODES[t] ?? TEAM_CODES[teamName(t)];
  if (known) return known;
  const words = teamName(t)
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter((w) => w && !GENERIC.has(w.toLowerCase()));
  if (words.length >= 2) {
    return words
      .map((w) => w[0]!)
      .join("")
      .slice(0, 4)
      .toUpperCase();
  }
  return (words[0] ?? teamName(t)).slice(0, 3).toUpperCase();
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
