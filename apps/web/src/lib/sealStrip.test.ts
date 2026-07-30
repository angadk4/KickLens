// The strip must be countable and must not imply a failure where none exists.
import { describe, expect, it } from "vitest";
import { buildStrip, dayKeys, pendingCount, sealedCount, stripCaption } from "./sealStrip";

const TODAY = Date.parse("2026-07-29T12:00:00Z");

describe("dayKeys", () => {
  it("is oldest → newest and ends today, in UTC", () => {
    const k = dayKeys(TODAY, 3);
    expect(k).toEqual(["2026-07-27", "2026-07-28", "2026-07-29"]);
  });

  it("returns exactly the requested length", () => {
    expect(dayKeys(TODAY, 90)).toHaveLength(90);
  });
});

describe("buildStrip", () => {
  it("fills matching days and leaves the rest EXPLICITLY empty", () => {
    const s = buildStrip(
      [{ day: "2026-07-28", root: "abc", committed_at_utc: "2026-07-29T12:00:02Z" }],
      TODAY,
      3,
    );
    expect(s).toHaveLength(3);
    expect(s[0]?.root).toBeNull();
    expect(s[1]?.root).toBe("abc");
    expect(s[1]?.committedAt).toBe("2026-07-29T12:00:02Z");
    expect(s[2]?.root).toBeNull();
  });

  it("tolerates a full timestamp in the day field", () => {
    const s = buildStrip([{ day: "2026-07-29T00:00:00Z", root: "z" }], TODAY, 2);
    expect(s[1]?.root).toBe("z");
  });

  it("ignores roots outside the window rather than shifting the calendar", () => {
    const s = buildStrip([{ day: "2020-01-01", root: "old" }], TODAY, 3);
    expect(sealedCount(s)).toBe(0);
    expect(s).toHaveLength(3);
  });

  it("an empty payload yields a full, empty, countable strip", () => {
    const s = buildStrip([], TODAY, 90);
    expect(s).toHaveLength(90);
    expect(sealedCount(s)).toBe(0);
  });
});

describe("pending days", () => {
  it("today is PENDING, never a missed seal — its root is due at 12:00 UTC tomorrow", () => {
    const s = buildStrip([], TODAY, 3);
    expect(s[2]?.day).toBe("2026-07-29");
    expect(s[2]?.pending).toBe(true);
  });

  it("yesterday is pending only until 12:00 UTC today", () => {
    const before = buildStrip([], Date.parse("2026-07-29T09:00:00Z"), 3);
    expect(before[1]?.pending).toBe(true);
    const after = buildStrip([], Date.parse("2026-07-29T15:00:00Z"), 3);
    expect(after[1]?.pending).toBe(false); // now genuinely unsealed
  });

  it("a day WITH a root is never pending", () => {
    const s = buildStrip([{ day: "2026-07-29", root: "a" }], TODAY, 3);
    expect(s[2]?.pending).toBe(false);
  });

  it("older empty days are not pending — they are settled and unsealed", () => {
    const s = buildStrip([], TODAY, 30);
    expect(s[0]?.pending).toBe(false);
    expect(pendingCount(s)).toBeLessThanOrEqual(2);
  });
});

describe("stripCaption", () => {
  it("says a cell is a DAY, not a forecast — the reading that must be foreclosed", () => {
    const c = stripCaption(buildStrip([], TODAY, 90));
    expect(c).toContain("One cell per calendar day");
    expect(c).not.toContain("per forecast");
  });

  it("explains an empty cell rather than leaving it looking like a failure", () => {
    const c = stripCaption(buildStrip([], TODAY, 90));
    expect(c).toContain("no official forecast was issued that day");
  });

  it("counts honestly, and EXCLUDES not-yet-due days from the denominator", () => {
    const s = buildStrip(
      [
        { day: "2026-07-29", root: "a" },
        { day: "2026-07-28", root: "b" },
      ],
      TODAY,
      30,
    );
    // both newest days have roots here, so nothing is pending and all 30 are settled
    expect(stripCaption(s)).toContain("2 of the last 30 settled days sealed");
  });

  it("says the newest days are AWAITING their seal rather than counting them as failures", () => {
    const c = stripCaption(buildStrip([], TODAY, 30));
    expect(c).toContain("awaiting the 12:00 UTC seal");
    expect(c).toContain("settled days");
  });
});
