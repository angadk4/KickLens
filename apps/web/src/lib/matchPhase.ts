// The single source of truth for a match's DISPLAY state. The DB's status/result are only
// refreshed by the results ingest, so between kickoff and the next sync a finished game
// still reads status='scheduled', result=null — labelling from raw status alone is how the
// site once claimed "in play" for games that ended hours earlier. Precedence here: hard
// truth (void/grade/result) → the provider's live signal → honest elapsed-time inference.
export type MatchPhase =
  | "upcoming" // future kickoff, forecast still preliminary (or absent)
  | "upcoming-frozen" // future kickoff, official forecast sealed at kickoff−3h
  | "in-play" // kicked off, inside expected regulation + stoppage
  | "result-pending" // past expected full time, result not yet synced (INFERRED — we never claim "full time")
  | "awaiting-grade" // result is in, grade job hasn't run yet
  | "graded"
  | "postponed"
  | "cancelled"
  | "abandoned"
  | "voided";

/** 45+45 regulation + 15 half-time + ~20 stoppage/provider lag. Below this we say
    "in play"; at/after it, with no result, we stop claiming a game is still being played. */
export const LIKELY_FT_MIN = 125;

/** A provider-confirmed 'in_play' earns extra trust (delays, long stoppage) — but not
    forever: a mid-game snapshot from the last sync must also expire, or a finished game
    would read "in play" until the next ingest (the exact defect this model exists to fix). */
export const IN_PLAY_TRUST_MIN = LIKELY_FT_MIN + 60;

/** A sealed fixture kicking off within this window gets the "kicks off in…" cue. */
export const IMMINENT_KICKOFF_MIN = 120;

export type PhaseInput = {
  kickoff_utc: string | null;
  /** canonical DB status when the payload carries it (scheduled/in_play/final/postponed/…) */
  status?: string | null;
  result?: "H" | "D" | "A" | null;
  graded?: boolean;
  voided?: boolean;
  /** an official-frozen forecast exists for the fixture */
  frozen?: boolean;
  /** inject Date.now() from a clock tick so labels re-derive without a refetch */
  now?: number;
};

/** The ONLY predicate licensed to render the word LIVE or the equaliser mark. `result-pending`
    means "expected full time has passed; the result posts at the next sync" — a game we are no
    longer willing to claim is being played, so it gets neither. */
export function isLiveNow(p: MatchPhase): boolean {
  return p === "in-play";
}

/** HOW DO WE KNOW? Either the provider told us, or we inferred it from the clock. The site
    saying which is, itself, the interesting thing — and `InPlayItem.status` is the finest
    liveness signal in the product and has never been shown. /matches/in-play can only return
    scheduled | in_play | final. */
export function phaseBasis(i: Pick<PhaseInput, "status">): "provider" | "clock" {
  return i.status === "in_play" || i.status === "final" ? "provider" : "clock";
}

/** One honest sentence per stored status, for the in-play card's detail line.
    CAREFUL: the browser sees what OUR ingest wrote, never the provider's feed directly. So these
    sentences may not describe what the provider did — only what we have ingested. Saying "the
    provider has not updated" would assert something about a third party we cannot observe: our
    own sweep may simply not have run. The wording below claims only our side of it. */
export function basisNote(status: string | null | undefined): string {
  switch (status) {
    case "in_play":
      return "a live update has been ingested · provider-confirmed";
    case "final":
      // the phase here is awaiting-grade: the RESULT is stored, the GRADE is not
      return "a final score has been ingested · grade not yet written";
    case "scheduled":
      // the row nobody ever shows: our own label says "in play" BY INFERENCE, and this admits
      // that nothing has confirmed it
      return "no live update ingested since kickoff · inferred from the clock";
    default:
      return "inferred from the clock";
  }
}

export function matchPhase(i: PhaseInput): MatchPhase {
  const now = i.now ?? Date.now();
  if (i.voided) return "voided";
  if (i.status === "postponed" || i.status === "cancelled" || i.status === "abandoned") {
    return i.status;
  }
  if (i.graded) return "graded";
  // ingest writes result and status='final' together — either one means the result is in
  if (i.result != null || i.status === "final") return "awaiting-grade";
  const ko = i.kickoff_utc ? new Date(i.kickoff_utc).getTime() : Number.NaN;
  if (Number.isNaN(ko) || now < ko) return i.frozen ? "upcoming-frozen" : "upcoming";
  const elapsedMin = (now - ko) / 60_000;
  if (i.status === "in_play") {
    // a live provider signal is trusted longer than the inference (delays/stoppage), but a
    // stale mid-game snapshot still expires — it too is only as fresh as the last sync
    return elapsedMin < IN_PLAY_TRUST_MIN ? "in-play" : "result-pending";
  }
  // stale 'scheduled' past kickoff: infer from the clock — the DB can't know yet
  return elapsedMin < LIKELY_FT_MIN ? "in-play" : "result-pending";
}

/** The ONE definition of "upcoming": kickoff still in the future. Fetches are periodic but
    the clock isn't, so an open tab must drop a fixture the moment it kicks off — otherwise
    the same match sits in an "upcoming" list AND the in-play band. Mirrors the server's
    `kickoff_utc > now()` filter on /matches/upcoming; pass a clock tick as `now`. */
export function notYetKickedOff<T extends { kickoff_utc: string }>(list: T[], now: number): T[] {
  return list.filter((m) => new Date(m.kickoff_utc).getTime() > now);
}

/** Display text per phase. `title` carries the honest mechanics for a hover/tooltip. */
export function phaseLabel(p: MatchPhase): { text: string; title?: string } {
  switch (p) {
    case "in-play":
      // "scheduled kickoff has passed", not "kicked off": for a weather-delayed game the
      // provider may still say scheduled — the title must stay true in that case too
      return {
        text: "in play",
        title: "The scheduled kickoff has passed; the frozen forecast cannot change.",
      };
    case "result-pending":
      return {
        text: "awaiting result",
        title:
          "Expected full time has passed; the final score posts at the next results sync.",
      };
    case "awaiting-grade":
      return {
        text: "full time · awaiting grade",
        title: "Result is in; grading runs automatically.",
      };
    case "graded":
      return { text: "full time · graded" };
    case "upcoming-frozen":
      return {
        text: "upcoming · forecast sealed",
        title:
          "The official forecast froze at kickoff−3h and can never change; the match has not kicked off yet.",
      };
    case "upcoming":
      return { text: "upcoming" };
    case "voided":
      return { text: "voided" };
    default:
      return { text: p }; // postponed / cancelled / abandoned read verbatim
  }
}
