// The anti-lying tests. The browser cannot know when a forecast was written, so no
// announcement may imply it just happened.
import { describe, expect, it } from "vitest";
import { composeTakeover, freezeAnnouncement } from "./liveCopy";
import type { LiveEvent } from "./liveEvents";

const CUT = new Date("2026-07-31T20:30:00Z");
const cutoffOf = () => CUT;

const freeze = (id: number, home: string, away: string): LiveEvent => ({
  kind: "freeze",
  matchId: id,
  hash: `hash-${id}`,
  home,
  away,
  kickoff: "2026-07-31T23:30:00Z",
});

describe("freezeAnnouncement", () => {
  it("HONESTY: never claims the freeze happened 'just now'", () => {
    const { head, sub } = freezeAnnouncement("NYC", "TOR", CUT, "deadbeefcafe");
    const all = `${head} ${sub}`.toLowerCase();
    for (const lie of ["just now", "moments ago", "seconds ago", "right now"]) {
      expect(all).not.toContain(lie);
    }
  });

  it("names the two moments it CAN verify: the cutoff and the publishing run", () => {
    const { sub } = freezeAnnouncement("NYC", "TOR", CUT);
    expect(sub).toContain("inputs locked");
    expect(sub).toContain("run");
  });

  it("carries the matchup and, when known, the hash", () => {
    const withHash = freezeAnnouncement("NYC", "TOR", CUT, "abcdef123456789");
    expect(withHash.head).toContain("TOR");
    expect(withHash.sub).toContain("abcdef123456");
    const without = freezeAnnouncement("NYC", "TOR", CUT);
    expect(without.sub).not.toContain("abcdef");
  });
});

describe("composeTakeover", () => {
  it("nothing to say ⇒ null (no empty overlay)", () => {
    expect(composeTakeover([], cutoffOf)).toBeNull();
  });

  it("one freeze is gold — officialness", () => {
    const t = composeTakeover([freeze(1, "NYC", "TOR")], cutoffOf);
    expect(t?.tone).toBe("official");
    expect(t?.head).toContain("FROZEN");
  });

  it("FOUR freezes fold into ONE strap, never four overlays", () => {
    const t = composeTakeover(
      [freeze(1, "A", "B"), freeze(2, "C", "D"), freeze(3, "E", "F"), freeze(4, "G", "H")],
      cutoffOf,
    );
    expect(t).not.toBeNull();
    expect(t?.head).toContain("4 OFFICIAL FORECASTS FROZEN");
    expect(t?.sub).toContain("and 2 more");
  });

  it("a grade is CHALK, not gold — grading is not an act of officialness", () => {
    const t = composeTakeover([{ kind: "graded", delta: 2, total: 26 }], cutoffOf);
    expect(t?.tone).toBe("chalk");
    expect(t?.head).toContain("2 FORECASTS GRADED");
    expect(t?.sub).toContain("n=26");
  });

  it("a grade announcement carries the count and n, never a score", () => {
    const t = composeTakeover([{ kind: "graded", delta: 1, total: 27 }], cutoffOf);
    const all = `${t?.head} ${t?.sub}`.toLowerCase();
    for (const forbidden of ["log loss", "correct", "hit", "missed", "beat"]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it("a freeze outranks a grade in the same batch", () => {
    const t = composeTakeover(
      [{ kind: "graded", delta: 1, total: 27 }, freeze(1, "A", "B")],
      cutoffOf,
    );
    expect(t?.head).toContain("FROZEN");
  });

  it("an ANOMALY outranks a grade — a replaced official is the headline", () => {
    const t = composeTakeover(
      [{ kind: "graded", delta: 1, total: 27 }, { kind: "anomaly", matchId: 3 }],
      cutoffOf,
    );
    expect(t?.head).toContain("REPLACED");
  });

  it("HONESTY: the anomaly copy never alleges tampering the client cannot establish", () => {
    // a changed hash for a match_id has a documented innocent cause (void + reissue after a
    // postponement or kickoff move); the browser cannot tell that apart from foul play
    const t = composeTakeover([{ kind: "anomaly", matchId: 3 }], cutoffOf);
    const all = `${t?.head} ${t?.sub}`.toLowerCase();
    for (const overclaim of ["tamper", "altered", "edited", "rewritten", "cheat"]) {
      expect(all).not.toContain(overclaim);
    }
    expect(all).toContain("voided"); // it names the likely cause instead
  });

  it("an unknown cutoff cannot produce a fabricated freeze strap", () => {
    expect(composeTakeover([freeze(1, "A", "B")], () => null)).toBeNull();
  });

  it("arrivals and provider changes alone are not worth an overlay", () => {
    expect(
      composeTakeover(
        [
          { kind: "arrived", matchId: 1 },
          { kind: "provider", matchId: 1, from: "scheduled", to: "in_play" },
        ],
        cutoffOf,
      ),
    ).toBeNull();
  });
});
