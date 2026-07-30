// This file is the answer to "how do you test that the freeze choreography fires exactly
// once, on the right transition, and never on page load?" — because every one of those is a
// property of a pure function.
import { describe, expect, it } from "vitest";
import { boardSnapshot, diffBoard, phaseTransitions, type BoardSnapshot } from "./liveEvents";
import { LIKELY_FT_MIN } from "./matchPhase";

const snap = (o: Partial<BoardSnapshot>): BoardSnapshot => ({
  frozen: {},
  drafts: {},
  inPlayStatus: {},
  totalGraded: null,
  ...o,
});

describe("diffBoard", () => {
  it("THE LOAD RULE: no previous state ⇒ no events, ever", () => {
    expect(diffBoard(null, snap({ frozen: { 1: "abc" }, totalGraded: 40 }))).toEqual([]);
  });

  it("an identical refetch is silent (and this is what makes StrictMode safe)", () => {
    const s = snap({ frozen: { 1: "abc" }, drafts: { 2: "x" }, totalGraded: 12 });
    expect(diffBoard(s, s)).toEqual([]);
    expect(diffBoard(s, snap({ frozen: { 1: "abc" }, drafts: { 2: "x" }, totalGraded: 12 }))).toEqual(
      [],
    );
  });

  it("fires exactly one freeze on draft → official, carrying the hash", () => {
    const prev = snap({ drafts: { 7: "0.5|0.3|0.2" } });
    const next = snap({ frozen: { 7: "deadbeef" } });
    const evs = diffBoard(prev, next, { 7: { home: "NYC", away: "TOR", kickoff: "K" } });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ kind: "freeze", matchId: 7, hash: "deadbeef", home: "NYC" });
  });

  it("does NOT announce a fixture that merely appears already frozen (we didn't witness it)", () => {
    const prev = snap({ frozen: { 1: "a" } });
    const next = snap({ frozen: { 1: "a", 9: "new" } }); // 9 arrived already sealed
    expect(diffBoard(prev, next)).toEqual([]);
  });

  it("a CHANGED sealed hash is an anomaly, not a freeze — surfaced, never hidden", () => {
    const evs = diffBoard(snap({ frozen: { 3: "one" } }), snap({ frozen: { 3: "two" } }));
    expect(evs).toEqual([{ kind: "anomaly", matchId: 3 }]);
  });

  it("a payload REGRESSION (frozen → draft) is not an event", () => {
    // merge-on-failure can serve older data; that is not something to announce
    expect(diffBoard(snap({ frozen: { 4: "a" } }), snap({ drafts: { 4: "x" } }))).toEqual([]);
  });

  it("grades are monotonic: only increases fire", () => {
    expect(diffBoard(snap({ totalGraded: 24 }), snap({ totalGraded: 26 }))).toEqual([
      { kind: "graded", delta: 2, total: 26 },
    ]);
    expect(diffBoard(snap({ totalGraded: 26 }), snap({ totalGraded: 26 }))).toEqual([]);
    expect(diffBoard(snap({ totalGraded: 26 }), snap({ totalGraded: 24 }))).toEqual([]);
    expect(diffBoard(snap({ totalGraded: null }), snap({ totalGraded: 5 }))).toEqual([]);
  });

  it("an id new to the in-play band arrives; a changed provider status is reported", () => {
    expect(diffBoard(snap({}), snap({ inPlayStatus: { 5: "scheduled" } }))).toEqual([
      { kind: "arrived", matchId: 5 },
    ]);
    expect(
      diffBoard(snap({ inPlayStatus: { 5: "scheduled" } }), snap({ inPlayStatus: { 5: "final" } })),
    ).toEqual([{ kind: "provider", matchId: 5, from: "scheduled", to: "final" }]);
  });

  it("a whole hourly run of four freezes yields four events for one strap to fold", () => {
    const prev = snap({ drafts: { 1: "a", 2: "b", 3: "c", 4: "d" } });
    const next = snap({ frozen: { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } });
    expect(diffBoard(prev, next).filter((e) => e.kind === "freeze")).toHaveLength(4);
  });
});

describe("boardSnapshot", () => {
  it("projects frozen and draft forecasts apart, and captures provider status", () => {
    const s = boardSnapshot(
      [
        {
          match_id: 1,
          home: "A",
          away: "B",
          kickoff_utc: "K",
          season: 2026,
          forecast: { type: "official-frozen", p_home: 0.5, p_draw: 0.3, p_away: 0.2, forecast_hash: "hh" },
        },
        {
          match_id: 2,
          home: "C",
          away: "D",
          kickoff_utc: "K",
          season: 2026,
          forecast: { type: "draft-preliminary", p_home: 0.4, p_draw: 0.3, p_away: 0.3 },
        },
      ] as never,
      [{ match_id: 3, status: "in_play" }] as never,
      17,
    );
    expect(s.frozen).toEqual({ 1: "hh" });
    expect(s.drafts[2]).toBe("0.4|0.3|0.3");
    expect(s.inPlayStatus).toEqual({ 3: "in_play" });
    expect(s.totalGraded).toBe(17);
  });

  it("tolerates null payloads", () => {
    expect(boardSnapshot(null, null, null)).toEqual({
      frozen: {},
      drafts: {},
      inPlayStatus: {},
      totalGraded: null,
    });
  });
});

describe("phaseTransitions", () => {
  const KO = "2026-08-01T23:30:00+00:00";
  const ko = new Date(KO).getTime();
  const item = { match_id: 1, kickoff_utc: KO, frozen: true };

  it("the first tick and a duplicate tick are silent", () => {
    expect(phaseTransitions([item], null, ko)).toEqual([]);
    expect(phaseTransitions([item], ko, ko)).toEqual([]);
  });

  it("a backwards clock is silent (DST, a tab waking)", () => {
    expect(phaseTransitions([item], ko + 1000, ko - 1000)).toEqual([]);
  });

  it("crossing kickoff fires exactly one transition into in-play", () => {
    const evs = phaseTransitions([item], ko - 1000, ko + 1000);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ matchId: 1, from: "upcoming-frozen", to: "in-play" });
  });

  it("crossing the honest full-time inference fires in-play → result-pending", () => {
    const a = ko + (LIKELY_FT_MIN - 2) * 60_000;
    const b = ko + (LIKELY_FT_MIN + 2) * 60_000;
    const evs = phaseTransitions([{ ...item, status: "scheduled" }], a, b);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ from: "in-play", to: "result-pending" });
  });

  it("no crossing ⇒ no event", () => {
    expect(phaseTransitions([item], ko - 5000, ko - 1000)).toEqual([]);
  });
});
