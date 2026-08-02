// The board's honesty depends on two couplings, both pinned here: the registry must
// account for exactly the CRON_RULES the Engineering page prints (no invented jobs, none
// hidden), and the inference row must agree with lib/format.ts freezeRunOf — the site
// already promises "anchors at the next hourly run" from that function, and a board that
// disagreed with the hero would be two clocks in one station.
import { describe, expect, it } from "vitest";
import { CRON_RULES } from "./facts";
import { freezeRunOf } from "./format";
import { atLabel, nextRun, nextUp, SCHEDULE, slotsOf, untilLabel, type CronSpec } from "./schedule";

const T = (iso: string) => new Date(iso).getTime();

describe("slotsOf", () => {
  it("daily lists the given hours, sorted", () => {
    expect(slotsOf({ kind: "daily", hours: [20, 8], minute: 0 })).toEqual([
      { h: 8, m: 0 },
      { h: 20, m: 0 },
    ]);
  });
  it("hourly covers the window inclusive (default: the whole day)", () => {
    expect(slotsOf({ kind: "hourly", minute: 0, hourWindow: [1, 6] })).toHaveLength(6);
    expect(slotsOf({ kind: "hourly", minute: 20 })).toHaveLength(24);
  });
  it("everyNHours anchors at hour 0, like cron */n", () => {
    expect(slotsOf({ kind: "everyNHours", n: 2, minute: 35 }).map((s) => s.h)).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22,
    ]);
  });

  it("an impossible spec throws instead of hanging or returning NaN", () => {
    expect(() => slotsOf({ kind: "daily", hours: [], minute: 0 })).toThrow(RangeError);
    expect(() => slotsOf({ kind: "hourly", minute: 0, hourWindow: [6, 1] })).toThrow(RangeError);
    expect(() => slotsOf({ kind: "everyNHours", n: 0, minute: 35 })).toThrow(RangeError);
    expect(() => slotsOf({ kind: "everyNHours", n: -2, minute: 35 })).toThrow(RangeError);
  });
});

describe("nextRun — strictly after, with honest rollovers", () => {
  const ingest: CronSpec = { kind: "daily", hours: [8, 20], minute: 0 };

  it("daily [8,20] boundaries", () => {
    expect(nextRun(ingest, T("2026-08-01T07:59:59Z"))).toBe(T("2026-08-01T08:00:00Z"));
    // STRICTLY after: at exactly 08:00:00.000 the run is firing, not "next"
    expect(nextRun(ingest, T("2026-08-01T08:00:00Z"))).toBe(T("2026-08-01T20:00:00Z"));
    expect(nextRun(ingest, T("2026-08-01T20:00:00Z"))).toBe(T("2026-08-02T08:00:00Z"));
  });

  it("month, year and leap-day rollovers via Date.UTC overflow", () => {
    expect(nextRun(ingest, T("2026-08-31T21:00:00Z"))).toBe(T("2026-09-01T08:00:00Z"));
    expect(nextRun(ingest, T("2026-12-31T21:00:00Z"))).toBe(T("2027-01-01T08:00:00Z"));
    expect(nextRun(ingest, T("2028-02-28T21:00:00Z"))).toBe(T("2028-02-29T08:00:00Z"));
    expect(nextRun(ingest, T("2028-02-29T21:00:00Z"))).toBe(T("2028-03-01T08:00:00Z"));
  });

  it("hourly :20 rolls over the day", () => {
    const inf: CronSpec = { kind: "hourly", minute: 20 };
    expect(nextRun(inf, T("2026-08-01T23:21:00Z"))).toBe(T("2026-08-02T00:20:00Z"));
  });

  it("the 01–06 night window: before, inside, exhausted", () => {
    const night: CronSpec = { kind: "hourly", minute: 0, hourWindow: [1, 6] };
    expect(nextRun(night, T("2026-08-01T00:30:00Z"))).toBe(T("2026-08-01T01:00:00Z"));
    expect(nextRun(night, T("2026-08-01T03:10:00Z"))).toBe(T("2026-08-01T04:00:00Z"));
    expect(nextRun(night, T("2026-08-01T06:00:00Z"))).toBe(T("2026-08-02T01:00:00Z"));
    expect(nextRun(night, T("2026-08-01T15:00:00Z"))).toBe(T("2026-08-02T01:00:00Z"));
  });

  it("grade every-2h-:35 is anchored at EVEN hours — 01:00's next is 02:35, never 01:35", () => {
    const grade: CronSpec = { kind: "everyNHours", n: 2, minute: 35 };
    expect(nextRun(grade, T("2026-08-01T01:00:00Z"))).toBe(T("2026-08-01T02:35:00Z"));
    expect(nextRun(grade, T("2026-08-01T02:34:59Z"))).toBe(T("2026-08-01T02:35:00Z"));
    expect(nextRun(grade, T("2026-08-01T02:35:00Z"))).toBe(T("2026-08-01T04:35:00Z"));
    expect(nextRun(grade, T("2026-08-01T23:00:00Z"))).toBe(T("2026-08-02T00:35:00Z"));
  });

  it("property: 1,000 arbitrary times × every spec → nextRun > now and ≤ now + 24h", () => {
    const base = T("2026-08-01T00:00:00Z");
    const year = 365 * 24 * 3600_000;
    for (let i = 0; i < 1000; i++) {
      // deterministic pseudo-random spread (no Math.random — reproducible failures)
      const now = base + ((i * 2654435761) % year);
      for (const row of SCHEDULE) {
        const at = nextRun(row.spec, now);
        expect(at).toBeGreaterThan(now);
        expect(at).toBeLessThanOrEqual(now + 24 * 3600_000);
      }
    }
  });
});

describe("coherence with the rest of the site", () => {
  it("the inference row IS freezeRunOf — the board and the hero can never disagree", () => {
    const inference = SCHEDULE.find((r) => r.key === "inference")!;
    const base = T("2026-08-01T00:00:00Z");
    for (let i = 0; i < 1000; i++) {
      const now = base + ((i * 40503 + 7) % (30 * 24 * 3600_000));
      // freezeRunOf is "at or after a CUTOFF"; nextRun is "strictly after NOW". They
      // coincide everywhere except the exact :20:00.000 instant — excluded here and
      // pinned separately below.
      if (new Date(now).getUTCMinutes() === 20 && now % 60_000 === 0) continue;
      expect(nextRun(inference.spec, now)).toBe(freezeRunOf(new Date(now)).getTime());
    }
  });

  it("…and the one instant they differ is the documented boundary semantics", () => {
    const inference = SCHEDULE.find((r) => r.key === "inference")!;
    const at20 = T("2026-08-01T14:20:00Z");
    expect(freezeRunOf(new Date(at20)).getTime()).toBe(at20); // a cutoff AT :20 freezes AT :20
    expect(nextRun(inference.spec, at20)).toBe(at20 + 3600_000); // "next" is strictly after
  });

  it("the registry folds to exactly CRON_RULES — no invented jobs, none hidden", () => {
    expect(SCHEDULE.reduce((n, r) => n + r.rules, 0)).toBe(CRON_RULES);
    expect(SCHEDULE).toHaveLength(8); // 9 rules, 8 rows: the two full-ingest crons fold
  });

  it("every row names its evidence or admits the API has none", () => {
    for (const row of SCHEDULE) {
      expect(["full-ingest", "results-sweep", "ingest", "grade", "merkle", "none"]).toContain(
        row.evidence,
      );
      expect(row.note.length).toBeGreaterThan(10);
    }
  });

  it("the night results row is NEVER evidenced from the sweep-agnostic ingest timestamp", () => {
    // /health's last_ingest is a greatest() over ALL ingest runs, so pointing the narrow
    // night row at it printed the FULL sweep's timestamp for ~17 hours of every day — the
    // row claimed a 20:00 run its own cadence cell says cannot happen. This is the same
    // full-vs-narrow conflation that masked the 2026-07-23 outage, and it has now been
    // reintroduced twice (lib/activity.ts, then here). It gets a test.
    const results = SCHEDULE.find((r) => r.key === "ingest-results")!;
    expect(results.evidence).toBe("results-sweep");
    expect(results.evidence).not.toBe("ingest");
    // and only the FULL sweep may use the full-ingest health field
    expect(SCHEDULE.find((r) => r.key === "ingest-full")!.evidence).toBe("full-ingest");
    // nothing else claims a sweep-agnostic ingest timestamp
    expect(SCHEDULE.filter((r) => r.evidence === "ingest")).toHaveLength(0);
  });

  it("the odds row does not describe its captures as closing or as displayed", () => {
    // ingestion/odds.py stores is_closing=false and captures near T-3h, and no aggregate
    // odds display exists anywhere on the site — both halves of the retired phrase were false
    const odds = SCHEDULE.find((r) => r.key === "odds")!;
    expect(odds.note).not.toMatch(/closing/i);
    expect(odds.note).not.toMatch(/aggregate display/i);
    expect(odds.note).toMatch(/never displayed/i);
  });
});

describe("nextUp", () => {
  it("picks the soonest firing", () => {
    // 13:50 UTC: odds 14:05 beats feature 14:10, inference 14:20, grade 14:35 …
    const { row, at } = nextUp(SCHEDULE, T("2026-08-01T13:50:00Z"));
    expect(row.key).toBe("odds");
    expect(at).toBe(T("2026-08-01T14:05:00Z"));
  });

  it("is a UNIQUE minimum at every minute of a simulated week (no ambiguous hero row)", () => {
    const base = T("2026-08-03T00:00:30Z"); // :30s — between minute marks
    for (let min = 0; min < 7 * 24 * 60; min++) {
      const now = base + min * 60_000;
      const best = nextUp(SCHEDULE, now);
      const atBest = SCHEDULE.filter((r) => nextRun(r.spec, now) === best.at);
      expect(atBest, new Date(now).toISOString()).toHaveLength(1);
    }
  });
});

describe("labels", () => {
  it("untilLabel ceils and never says 'in 0m'", () => {
    const now = T("2026-08-01T13:50:00Z");
    expect(untilLabel(now + 10_000, now)).toBe("in 1m");
    expect(untilLabel(now + 42 * 60_000, now)).toBe("in 42m");
    expect(untilLabel(now + 185 * 60_000, now)).toBe("in 3h 05m");
    expect(untilLabel(now + 120 * 60_000, now)).toBe("in 2h");
  });
  it("atLabel prints HH:MM UTC", () => {
    expect(atLabel(T("2026-08-01T14:05:00Z"))).toBe("14:05 UTC");
  });
});
