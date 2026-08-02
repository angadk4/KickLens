import { describe, expect, it } from "vitest";
import type { ActivityItem } from "../api";
import { activityPhrase } from "./activity";

const ledger = (type: string, details: Record<string, unknown> | null = null): ActivityItem => ({
  kind: "ledger",
  type,
  at_utc: "2026-08-01T20:20:22+00:00",
  match_id: 812,
  home: "Inter Miami",
  away: "Nashville SC",
  details,
});

describe("activityPhrase — ledger events", () => {
  it("freeze / grade / anchor speak in the record's words, with the matchup separated", () => {
    expect(activityPhrase(ledger("OfficialFrozen"))).toEqual({
      action: "official forecast frozen",
      matchup: "Inter Miami vs Nashville SC",
      flag: null,
    });
    expect(activityPhrase(ledger("Graded")).action).toBe("graded against the result");
    expect(activityPhrase(ledger("AnchorPublished")).action).toBe(
      "anchor pushed to the public repository",
    );
  });

  it("a failed anchor push names its recovery in the same breath, flagged", () => {
    const p = activityPhrase(ledger("AnchorPushFailed"));
    expect(p.action).toBe("anchor push failed — the next run re-pushes it");
    expect(p.flag).toBe("failed");
  });

  it("Voided reuses voidPhrase — 'match postponed', never a generic 'superseded'", () => {
    const p = activityPhrase(ledger("Voided", { reason: "postponed" }));
    expect(p.action).toBe("forecast voided — match postponed");
    expect(p.flag).toBe("voided");
    // an unmapped/missing reason degrades to the bare fact
    expect(activityPhrase(ledger("Voided")).action).toBe("forecast voided");
  });

  it("an unknown event type prints as itself — never a wrong paraphrase", () => {
    expect(activityPhrase(ledger("SomeFutureEvent")).action).toBe("SomeFutureEvent");
  });
});

describe("activityPhrase — job items (the PRODUCER'S vocabulary)", () => {
  // These literals are the wire contract: jobs/handlers.py writes sweep "results_only" |
  // "full" and common/db.py finish_job writes status "done" | "failed". The first cut of
  // this suite asserted invented values ("results", "error") and so certified a phrase
  // map that mislabelled every night sweep — pin the REAL strings, nothing else.
  const job = (sweep: string, status: string): ActivityItem => ({
    kind: "job",
    job: "ingest",
    sweep,
    status,
    at_utc: "2026-08-01T20:00:00+00:00",
  });

  it("names the sweep kind and carries the literal status", () => {
    expect(activityPhrase(job("full", "done"))).toEqual({
      action: "full ingest sweep · done",
      matchup: null,
      flag: null,
    });
    expect(activityPhrase(job("results_only", "done")).action).toBe(
      "results-only ingest sweep · done",
    );
  });

  it("a failed run is flagged, not hidden — using the status the backend actually writes", () => {
    expect(activityPhrase(job("full", "failed")).flag).toBe("failed");
    expect(activityPhrase(job("results_only", "failed")).action).toBe(
      "results-only ingest sweep · failed",
    );
    // "running" is a real transient status and is not a failure
    expect(activityPhrase(job("full", "running")).flag).toBeNull();
  });
});
