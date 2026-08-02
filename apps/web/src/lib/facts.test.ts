// facts.ts states its own rule in its header: ONE definition per figure, so two pages can
// never disagree. But a constant can still drift away from the INFRASTRUCTURE it describes —
// and it did: `api_throttles` shipped on 2026-07-26 and ALARM_COUNT stayed 13 for a week,
// so the Engineering page under-counted its own alarms on the page whose eyebrow is
// "everything links to proof".
//
// These tests derive the operational counts from the Terraform itself. They are deliberately
// crude parsers, not HCL: a stricter parser would be more code and could not fail in a way
// this cannot. If the shape of alarms.tf changes enough to break the parse, the non-vacuity
// guards below fail loudly rather than silently passing on zero matches.
import { describe, expect, it } from "vitest";
import alarmsTf from "../../../../infra/terraform/alarms.tf?raw";
import lambdaTf from "../../../../infra/terraform/lambda.tf?raw";
import schedulesTf from "../../../../infra/terraform/schedules.tf?raw";
import { ALARM_COUNT, CRON_RULES } from "./facts";

/** The keys of `locals.job_defs` in lambda.tf — the set both alarm families fan out over. */
function jobDefKeys(src: string): string[] {
  const block = /job_defs\s*=\s*\{([\s\S]*?)\n  \}/.exec(src);
  if (!block) return [];
  return [...block[1]!.matchAll(/^\s*(\w+)\s*=\s*\{/gm)].map((m) => m[1]!);
}

/** Top-level `resource "aws_cloudwatch_metric_alarm" "<name>"` blocks, and whether each
    fans out over job_defs (for_each) or is a single alarm. */
function alarmResources(src: string): { name: string; forEach: boolean }[] {
  const out: { name: string; forEach: boolean }[] = [];
  const re = /resource\s+"aws_cloudwatch_metric_alarm"\s+"(\w+)"\s*\{([\s\S]*?)\n\}/g;
  for (const m of src.matchAll(re)) {
    out.push({ name: m[1]!, forEach: /for_each\s*=\s*local\.job_defs/.test(m[2]!) });
  }
  return out;
}

describe("the sources actually loaded (?raw returns '' for unresolved files)", () => {
  it("alarms.tf, lambda.tf and schedules.tf are non-empty", () => {
    expect(alarmsTf.length).toBeGreaterThan(500);
    expect(lambdaTf.length).toBeGreaterThan(500);
    expect(schedulesTf.length).toBeGreaterThan(300);
  });
});

describe("ALARM_COUNT is derived from infra/terraform/alarms.tf", () => {
  const jobs = jobDefKeys(lambdaTf);
  const alarms = alarmResources(alarmsTf);

  it("the parsers found real structure, not nothing", () => {
    expect(jobs.length).toBeGreaterThan(0);
    expect(alarms.length).toBeGreaterThan(0);
    // the six job handlers the contract freezes
    expect(jobs).toEqual(
      expect.arrayContaining(["ingest", "feature", "inference", "grade", "odds", "canary"]),
    );
  });

  it("equals (job alarms x jobs) + single alarms", () => {
    const perJob = alarms.filter((a) => a.forEach).length;
    const singles = alarms.filter((a) => !a.forEach).length;
    expect(ALARM_COUNT).toBe(perJob * jobs.length + singles);
  });

  it("counts BOTH api alarms — the specific drift that made this file exist", () => {
    const singleNames = alarms.filter((a) => !a.forEach).map((a) => a.name);
    expect(singleNames).toEqual(expect.arrayContaining(["api_errors", "api_throttles"]));
  });
});

describe("CRON_RULES is derived from infra/terraform/schedules.tf", () => {
  it("equals the number of cron() schedule expressions declared", () => {
    const rules = [...schedulesTf.matchAll(/rule\s*=\s*"cron\(/g)].length;
    expect(rules).toBeGreaterThan(0);
    expect(CRON_RULES).toBe(rules);
  });
});
