// The phase model is honesty-critical: it decides when the site stops claiming a game is
// "in play". Every boundary is pinned here with an injected clock — no mocked Date needed.
import { describe, expect, it } from "vitest";
import { IN_PLAY_TRUST_MIN, LIKELY_FT_MIN, matchPhase } from "./matchPhase";
import { dateShort, dayHeading } from "./format";

const KO = "2026-07-23T02:30:00+00:00";
const koMs = new Date(KO).getTime();
const min = 60_000;

describe("matchPhase", () => {
  it("future kickoff → upcoming / upcoming-frozen", () => {
    expect(matchPhase({ kickoff_utc: KO, now: koMs - min })).toBe("upcoming");
    expect(matchPhase({ kickoff_utc: KO, frozen: true, now: koMs - min })).toBe(
      "upcoming-frozen",
    );
  });

  it("kicked off with stale 'scheduled' → in-play until expected FT, then awaiting result", () => {
    const stale = { kickoff_utc: KO, status: "scheduled", frozen: true };
    expect(matchPhase({ ...stale, now: koMs + min })).toBe("in-play");
    expect(matchPhase({ ...stale, now: koMs + (LIKELY_FT_MIN - 1) * min })).toBe("in-play");
    // at/after the boundary we STOP claiming the game is being played
    expect(matchPhase({ ...stale, now: koMs + LIKELY_FT_MIN * min })).toBe("result-pending");
    expect(matchPhase({ ...stale, now: koMs + (LIKELY_FT_MIN + 300) * min })).toBe(
      "result-pending",
    );
  });

  it("a live provider signal is trusted past the inference boundary — but not forever", () => {
    expect(
      matchPhase({
        kickoff_utc: KO,
        status: "in_play",
        now: koMs + (LIKELY_FT_MIN + 30) * min, // e.g. long stoppage / delayed match
      }),
    ).toBe("in-play");
    // a stale mid-game snapshot from the last sync must expire too — otherwise a finished
    // game reads "in play" until the next ingest, the exact defect this model fixes
    expect(
      matchPhase({ kickoff_utc: KO, status: "in_play", now: koMs + IN_PLAY_TRUST_MIN * min }),
    ).toBe("result-pending");
  });

  it("result or status='final' → awaiting-grade; graded wins over both", () => {
    expect(matchPhase({ kickoff_utc: KO, result: "H", now: koMs + min })).toBe(
      "awaiting-grade",
    );
    expect(matchPhase({ kickoff_utc: KO, status: "final", now: koMs + 600 * min })).toBe(
      "awaiting-grade",
    );
    expect(
      matchPhase({ kickoff_utc: KO, status: "final", result: "A", graded: true, now: koMs }),
    ).toBe("graded");
  });

  it("terminal statuses pass through; voided outranks everything", () => {
    expect(matchPhase({ kickoff_utc: KO, status: "postponed", now: koMs })).toBe("postponed");
    expect(matchPhase({ kickoff_utc: KO, status: "cancelled", now: koMs })).toBe("cancelled");
    expect(matchPhase({ kickoff_utc: KO, status: "abandoned", now: koMs })).toBe("abandoned");
    expect(
      matchPhase({ kickoff_utc: KO, status: "postponed", voided: true, now: koMs }),
    ).toBe("voided");
  });

  it("null kickoff never claims play", () => {
    expect(matchPhase({ kickoff_utc: null, now: koMs })).toBe("upcoming");
  });
});

describe("UTC date coherence", () => {
  it("dayHeading groups on the same UTC day dateShort renders — no cross-page day jump", () => {
    // 02:30 UTC = the previous evening in US timezones; both helpers must say Jul 23
    expect(dayHeading(KO)).toBe("THU, JUL 23");
    expect(dateShort(KO)).toBe("Jul 23, 2026");
  });
});
