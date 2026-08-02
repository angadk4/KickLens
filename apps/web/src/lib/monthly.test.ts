import { describe, expect, it } from "vitest";
import { KNEW_NOTHING_LL, MIN_N_BUCKET_DETAIL } from "./facts";
import { monthlyCaption, monthlyRows, showMonthly } from "./monthly";

describe("monthlyRows", () => {
  it("sorts calendar-ascending across a year boundary", () => {
    const rows = monthlyRows(
      {
        "2027-01": { n: 40, log_loss: 1.01 },
        "2026-11": { n: 38, log_loss: 0.99 },
        "2026-12": { n: 12, log_loss: 1.2 },
      },
      MIN_N_BUCKET_DETAIL,
    );
    expect(rows.map((r) => r.key)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("labels via the month table — '2026-07' → 'Jul 2026'", () => {
    const rows = monthlyRows({ "2026-07": { n: 31, log_loss: 0.96 } }, 30);
    expect(rows[0]!.label).toBe("Jul 2026");
    expect(monthlyRows({ "2026-01": { n: 31, log_loss: 1 } }, 30)[0]!.label).toBe("Jan 2026");
    expect(monthlyRows({ "2026-12": { n: 31, log_loss: 1 } }, 30)[0]!.label).toBe("Dec 2026");
  });

  it("coerces a float n (SQL avg artifacts) and drops malformed keys and values", () => {
    const rows = monthlyRows(
      {
        "2026-07": { n: 31.0, log_loss: 0.96 },
        "not-a-month": { n: 10, log_loss: 1 },
        "2026-13": { n: 10, log_loss: 1 },
        "2026-00": { n: 10, log_loss: 1 },
        "2026-08": { n: Number.NaN, log_loss: 1 },
        "2026-09": { n: 10, log_loss: Number.POSITIVE_INFINITY },
        "2026-10": { n: 0, log_loss: 1 },
      },
      30,
    );
    expect(rows.map((r) => r.key)).toEqual(["2026-07"]);
    expect(rows[0]!.n).toBe(31);
  });

  it("marks small months at exactly the floor: n=29 hollow, n=30 solid", () => {
    const rows = monthlyRows(
      { "2026-07": { n: 29, log_loss: 1 }, "2026-08": { n: 30, log_loss: 1 } },
      30,
    );
    expect(rows.map((r) => r.small)).toEqual([true, false]);
  });

  it("null/undefined maps are an empty list, not a crash", () => {
    expect(monthlyRows(null, 30)).toEqual([]);
    expect(monthlyRows(undefined, 30)).toEqual([]);
  });
});

describe("showMonthly — the chart earns its place at two months", () => {
  const row = (key: string) => monthlyRows({ [key]: { n: 31, log_loss: 1 } }, 30);
  it("0 and 1 months → no chart; 2 → chart", () => {
    expect(showMonthly([])).toBe(false);
    expect(showMonthly(row("2026-07"))).toBe(false);
    expect(showMonthly([...row("2026-07"), ...row("2026-08")])).toBe(true);
  });
});

describe("monthlyCaption", () => {
  it("states the total n and the labelled baseline", () => {
    const rows = monthlyRows(
      { "2026-07": { n: 40, log_loss: 1 }, "2026-08": { n: 60, log_loss: 1 } },
      30,
    );
    const cap = monthlyCaption(rows);
    expect(cap).toContain("n=100");
    expect(cap).toContain(KNEW_NOTHING_LL.toFixed(4));
    expect(cap).not.toContain("Hollow"); // the explanation appears only when earned
  });

  it("explains hollow dots only when one exists", () => {
    const rows = monthlyRows(
      { "2026-07": { n: 12, log_loss: 1 }, "2026-08": { n: 60, log_loss: 1 } },
      30,
    );
    expect(monthlyCaption(rows)).toContain("Hollow dots");
    expect(monthlyCaption(rows)).toContain(`n=${MIN_N_BUCKET_DETAIL}`);
  });
});

describe("the display constant is the truth, rounded", () => {
  it("KNEW_NOTHING_LL is ln 3 at display precision", () => {
    expect(KNEW_NOTHING_LL).toBeCloseTo(Math.log(3), 4);
  });
});
