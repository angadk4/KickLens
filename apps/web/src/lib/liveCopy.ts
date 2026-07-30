// What a live announcement is allowed to SAY.
//
// The trap: "⬡ FROZEN just now" is a lie we would never notice. /matches/upcoming carries no
// creation timestamp, so the browser does not know the instant a forecast was written — only
// the cutoff (kickoff−3h) and the hourly run that publishes it. Every announcement therefore
// names those two verifiable moments and nothing else, and liveCopy.test.ts asserts the output
// never contains "just now" / "now" / "moments ago". A literal anti-lying unit test.
import { freezeRunOf, shortHash, teamName, timeLocal } from "./format";
import type { LiveEvent } from "./liveEvents";

export type Takeover = {
  /** gold ONLY for a freeze — a grade is not an act of officialness */
  tone: "official" | "chalk";
  head: string;
  sub: string;
};

export function freezeAnnouncement(
  home: string,
  away: string,
  cutoff: Date,
  hash?: string,
): { head: string; sub: string } {
  const run = freezeRunOf(cutoff);
  const parts = [
    `inputs locked ${timeLocal(cutoff.toISOString())}`,
    `published at the ${timeLocal(run.toISOString())} run`,
  ];
  if (hash) parts.push(shortHash(hash, 12));
  return {
    head: `OFFICIAL FORECAST FROZEN — ${teamName(home)} vs ${teamName(away)}`,
    sub: parts.join(" · "),
  };
}

/** Fold a whole hourly run into ONE strap. Four freezes must never be four overlays. */
export function composeTakeover(
  events: LiveEvent[],
  cutoffOfMatch: (matchId: number) => Date | null,
): Takeover | null {
  const freezes = events.filter((e): e is Extract<LiveEvent, { kind: "freeze" }> => e.kind === "freeze");
  if (freezes.length === 1) {
    const f = freezes[0]!;
    const cut = cutoffOfMatch(f.matchId);
    if (cut) {
      const { head, sub } = freezeAnnouncement(f.home, f.away, cut, f.hash);
      return { tone: "official", head, sub };
    }
  }
  if (freezes.length > 1) {
    const names = freezes
      .slice(0, 2)
      .map((f) => `${teamName(f.home)} vs ${teamName(f.away)}`)
      .join(" · ");
    const more = freezes.length - 2;
    return {
      tone: "official",
      head: `${freezes.length} OFFICIAL FORECASTS FROZEN — this run`,
      sub: more > 0 ? `${names} …and ${more} more` : names,
    };
  }

  // An anomaly outranks a grade — but the COPY must not overclaim. The browser sees that the
  // hash it holds for a match_id differs from the one it held before, and that has a legitimate
  // cause: a postponement or kickoff move VOIDS the official and a new one is issued, which is
  // the documented supersession path (ADR: void_reason). "A sealed forecast's values changed"
  // read as tampering, which the client cannot establish and which is usually not what happened.
  // So it reports the observation and names both explanations, in that order.
  const anomaly = events.find((e) => e.kind === "anomaly");
  if (anomaly) {
    return {
      tone: "chalk",
      head: "A NEW OFFICIAL FORECAST REPLACED AN EARLIER ONE",
      sub: "usually a voided fixture reissued after a postponement or kickoff move — open the match to see the timeline and both hashes",
    };
  }

  const graded = events.find((e): e is Extract<LiveEvent, { kind: "graded" }> => e.kind === "graded");
  if (graded) {
    return {
      tone: "chalk",
      head: `${graded.delta} FORECAST${graded.delta === 1 ? "" : "S"} GRADED`,
      // the count and its sample size, never a per-forecast score: that is exactly where
      // celebration asymmetry would sneak back in
      sub: `the live record is now n=${graded.total}`,
    };
  }
  return null;
}
