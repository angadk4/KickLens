// One phrase per activity item — authored here (pure, tested) so the feed can never
// improvise. The vocabulary rule: say what the SYSTEM did, in the record's own words;
// a failure names its recovery in the same breath (AnchorPushFailed is a retried
// condition, not an outage headline).
import type { ActivityItem } from "../api";
import { teamName, voidPhrase } from "./format";

/** The window both /engineering consumers request, so the feed's heading and the operations
    board's "last seen" fallback can never describe different spans of time. */
export const ACTIVITY_HOURS = 48;

export type ActivityPhrase = {
  /** what happened, without the matchup */
  action: string;
  /** "Home vs Away" for ledger items (the component links it); null for job items */
  matchup: string | null;
  /** timeline dot override: voided → danger, failed → warn; null → the gold record dot */
  flag: "voided" | "failed" | null;
};

const LEDGER_ACTION: Record<string, string> = {
  OfficialFrozen: "official forecast frozen",
  OfficialFinalized: "forecast finalized against the fixture revision",
  Graded: "graded against the result",
  Regraded: "regraded after a result correction",
  Corrected: "result corrected by the provider",
  AnchorPublished: "anchor pushed to the public repository",
  AnchorPushFailed: "anchor push failed — the next run re-pushes it",
};

export function activityPhrase(item: ActivityItem): ActivityPhrase {
  if (item.kind === "job") {
    // the PRODUCER'S vocabulary, verbatim (jobs/handlers.py writes "results_only"/"full",
    // and job_run.status is "done"/"failed"/"running") — the first cut of this file tested
    // against invented wire values ("results", "error") and mislabelled every night sweep
    // as a full one; activity.test.ts now pins the real strings
    const sweep =
      item.sweep === "results_only" ? "results-only ingest sweep" : "full ingest sweep";
    return {
      action: `${sweep} · ${item.status}`,
      matchup: null,
      flag: item.status === "failed" || item.status === "error" ? "failed" : null,
    };
  }
  const matchup = `${teamName(item.home)} vs ${teamName(item.away)}`;
  if (item.type === "Voided") {
    const reason = item.details?.["reason"];
    const vp = voidPhrase(typeof reason === "string" ? reason : undefined);
    return { action: vp ? `forecast voided — ${vp}` : "forecast voided", matchup, flag: "voided" };
  }
  return {
    // an unknown event type prints AS ITSELF — the ledger may grow types before this map does,
    // and a raw type name is more honest than a wrong paraphrase
    action: LEDGER_ACTION[item.type] ?? item.type,
    matchup,
    flag: item.type === "AnchorPushFailed" ? "failed" : null,
  };
}
