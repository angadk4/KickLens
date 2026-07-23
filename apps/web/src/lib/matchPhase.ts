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
