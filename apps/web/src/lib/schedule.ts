// The public Terraform cadence (infra/terraform/schedules.tf), as data — the operations
// board renders SCHEDULED next triggers from this, never success claims. Deliberately NOT
// a cron parser: the repo has nine rules in three shapes, so the type is a union of three
// shapes. A parser would be more code, more failure modes, and zero more truth.
//
// The registry is checkable two ways (schedule.test.ts): the rule count must equal
// lib/facts.ts CRON_RULES (the number the Engineering page already prints), and the
// inference row must agree with lib/format.ts freezeRunOf — the site's other :20 logic.

export type CronSpec =
  | { kind: "daily"; hours: number[]; minute: number }
  | { kind: "hourly"; minute: number; hourWindow?: [number, number] }
  | { kind: "everyNHours"; n: number; minute: number };

/** A spec's firing slots within one UTC day, ascending. Throws on a spec that can never
    fire (empty hours, inverted window, n ≤ 0) — the registry is authored, so an
    impossible spec is an authoring error and must fail loudly, not hang or return NaN. */
export function slotsOf(spec: CronSpec): { h: number; m: number }[] {
  let hours: number[];
  if (spec.kind === "daily") {
    hours = [...spec.hours].sort((a, b) => a - b);
  } else if (spec.kind === "hourly") {
    const [lo, hi] = spec.hourWindow ?? [0, 23];
    hours = [];
    for (let h = lo; h <= hi; h++) hours.push(h);
  } else {
    if (spec.n <= 0) throw new RangeError(`everyNHours: n must be positive, got ${spec.n}`);
    hours = [];
    // cron */n is anchored at hour 0 (grade-2h fires at EVEN hours — 01:00's next is 02:35)
    for (let h = 0; h < 24; h += spec.n) hours.push(h);
  }
  if (hours.length === 0) throw new RangeError("schedule spec has no firing slots");
  return hours.map((h) => ({ h, m: spec.minute }));
}

/** The next firing STRICTLY after nowMs, in ms UTC. Date.UTC's day overflow handles
    month/year/leap rollover — no calendar arithmetic here. */
export function nextRun(spec: CronSpec, nowMs: number): number {
  const slots = slotsOf(spec);
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  for (const s of slots) {
    const t = Date.UTC(y, mo, day, s.h, s.m);
    if (t > nowMs) return t;
  }
  const first = slots[0]!;
  return Date.UTC(y, mo, day + 1, first.h, first.m);
}

/** What the read-only API can actually prove about a job's last run. Everything else is
    honestly "not surfaced" — the API serves records, not job telemetry, by design. */
export type JobEvidence = "full-ingest" | "ingest" | "grade" | "merkle" | "none";

export type JobRow = {
  key: string;
  job: string;
  /** human cadence, UTC — printed verbatim in the Cadence column */
  cadence: string;
  spec: CronSpec;
  /** EventBridge rules this row folds (full ingest is TWO rules, one cadence) */
  rules: number;
  evidence: JobEvidence;
  note: string;
};

/** Eight rows ≡ nine EventBridge rules (the two full-ingest crons fold into one row). */
export const SCHEDULE: JobRow[] = [
  {
    key: "ingest-full",
    job: "Full ingest",
    cadence: "08:00 & 20:00",
    spec: { kind: "daily", hours: [8, 20], minute: 0 },
    rules: 2,
    evidence: "full-ingest",
    note: "fixtures, kickoff moves, results — the 7-day schedule window",
  },
  {
    key: "ingest-results",
    job: "Results sweep",
    cadence: "01:00–06:00 hourly",
    spec: { kind: "hourly", minute: 0, hourWindow: [1, 6] },
    rules: 1,
    evidence: "ingest",
    note: "results only — the night window MLS finals land in",
  },
  {
    key: "odds",
    job: "Odds snapshot",
    cadence: "hourly at :05",
    spec: { kind: "hourly", minute: 5 },
    rules: 1,
    evidence: "none",
    note: "closing three-way odds, aggregate display only",
  },
  {
    key: "feature",
    job: "Feature build",
    cadence: "hourly at :10",
    spec: { kind: "hourly", minute: 10 },
    rules: 1,
    evidence: "none",
    note: "point-in-time features for fixtures inside the cutoff window",
  },
  {
    key: "inference",
    job: "Inference & freeze",
    cadence: "hourly at :20",
    spec: { kind: "hourly", minute: 20 },
    rules: 1,
    evidence: "none",
    note: "writes, hashes and anchors any forecast whose cutoff has passed",
  },
  {
    key: "grade",
    job: "Grade",
    cadence: "every 2 h at :35",
    spec: { kind: "everyNHours", n: 2, minute: 35 },
    rules: 1,
    evidence: "grade",
    note: "scores finished matches; even hours (cron */2 anchors at 00)",
  },
  {
    key: "canary",
    job: "Canary",
    cadence: "09:00 daily",
    spec: { kind: "daily", hours: [9], minute: 0 },
    rules: 1,
    evidence: "none",
    note: "dead-man checks: overdue results, missed freezes, stuck anchors",
  },
  {
    key: "merkle",
    job: "Merkle seal",
    cadence: "12:00 daily",
    spec: { kind: "daily", hours: [12], minute: 0 },
    rules: 1,
    evidence: "merkle",
    note: "commits the previous UTC day's root — the tamper seal",
  },
];

/** The soonest firing across the board — the "now boarding" row. */
export function nextUp(rows: JobRow[], nowMs: number): { row: JobRow; at: number } {
  let best: { row: JobRow; at: number } | null = null;
  for (const row of rows) {
    const at = nextRun(row.spec, nowMs);
    if (!best || at < best.at) best = { row, at };
  }
  return best!;
}

/** "in 42m" / "in 3h 05m" — minute precision for the rows that aren't boarding.
    Ceils, so a run 10 seconds out reads "in 1m", never a lying "in 0m". */
export function untilLabel(atMs: number, nowMs: number): string {
  const mins = Math.max(1, Math.ceil((atMs - nowMs) / 60_000));
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${String(m).padStart(2, "0")}m`;
}

/** "14:10 UTC" for a firing time. */
export function atLabel(atMs: number): string {
  return `${new Date(atMs).toISOString().slice(11, 16)} UTC`;
}
