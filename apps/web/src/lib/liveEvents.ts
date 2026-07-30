// The board's event layer, as PURE DIFFS of two snapshots.
//
// The hard problem with announcing "a forecast just froze" is not the animation — it is
// firing exactly once, on the real transition, and never on a page load or on a refetch that
// merely re-delivers the same state. Expressing it as `diffBoard(prev, next)` makes that a
// unit test instead of a hope: **every function here returns [] when `prev` is null**, which
// IS the "never fire on load" rule, written once.
//
// It also makes the design StrictMode-safe with no special casing: dev's double load produces
// an identical snapshot, so the second pass diffs to nothing.
import type { InPlayItem, UpcomingMatch } from "../api";
import { matchPhase, type MatchPhase, type PhaseInput } from "./matchPhase";

export type BoardSnapshot = {
  /** match_id → forecast_hash, official-frozen only */
  frozen: Record<number, string>;
  /** match_id → the probability triple of a draft-preliminary forecast */
  drafts: Record<number, string>;
  /** match_id → raw provider status from /matches/in-play */
  inPlayStatus: Record<number, string>;
  totalGraded: number | null;
};

export type LiveEvent =
  | { kind: "freeze"; matchId: number; hash: string; home: string; away: string; kickoff: string }
  | { kind: "graded"; delta: number; total: number }
  | { kind: "arrived"; matchId: number }
  | { kind: "provider"; matchId: number; from: string; to: string }
  /** a sealed forecast's probabilities changed. Surfaced, never hidden. */
  | { kind: "anomaly"; matchId: number }
  | { kind: "phase"; matchId: number; from: MatchPhase; to: MatchPhase };

function probKey(f: { p_home: number; p_draw: number; p_away: number }): string {
  return `${f.p_home}|${f.p_draw}|${f.p_away}`;
}

export function boardSnapshot(
  list: UpcomingMatch[] | null,
  inPlay: InPlayItem[] | null,
  totalGraded: number | null,
): BoardSnapshot {
  const frozen: Record<number, string> = {};
  const drafts: Record<number, string> = {};
  for (const m of list ?? []) {
    const f = m.forecast;
    if (!f) continue;
    if (f.type === "official-frozen") frozen[m.match_id] = f.forecast_hash ?? probKey(f);
    else drafts[m.match_id] = probKey(f);
  }
  const inPlayStatus: Record<number, string> = {};
  for (const i of inPlay ?? []) inPlayStatus[i.match_id] = i.status;
  return { frozen, drafts, inPlayStatus, totalGraded };
}

/** Data-driven events. Returns [] when there is no PREVIOUS state — the whole load rule. */
export function diffBoard(
  prev: BoardSnapshot | null,
  next: BoardSnapshot,
  meta: Record<number, { home: string; away: string; kickoff: string }> = {},
): LiveEvent[] {
  if (prev === null) return [];
  const out: LiveEvent[] = [];

  for (const [id, hash] of Object.entries(next.frozen)) {
    const n = Number(id);
    if (prev.frozen[n] === undefined) {
      // ONLY draft → official counts as a freeze. A fixture that simply appears already
      // frozen was not witnessed freezing, so it gets a recency chip, not an announcement.
      if (prev.drafts[n] !== undefined) {
        const m = meta[n];
        out.push({
          kind: "freeze",
          matchId: n,
          hash,
          home: m?.home ?? "",
          away: m?.away ?? "",
          kickoff: m?.kickoff ?? "",
        });
      }
    } else if (prev.frozen[n] !== hash) {
      // a write-once record changed. That is either a void+reissue or something wrong.
      out.push({ kind: "anomaly", matchId: n });
    }
  }
  // deliberately NO "unfroze" event: merge-on-failure can regress a payload, and a
  // regression is not an event.

  if (prev.totalGraded !== null && next.totalGraded !== null && next.totalGraded > prev.totalGraded) {
    out.push({
      kind: "graded",
      delta: next.totalGraded - prev.totalGraded,
      total: next.totalGraded,
    });
  }

  for (const [id, status] of Object.entries(next.inPlayStatus)) {
    const n = Number(id);
    const before = prev.inPlayStatus[n];
    if (before === undefined) out.push({ kind: "arrived", matchId: n });
    else if (before !== status) out.push({ kind: "provider", matchId: n, from: before, to: status });
  }

  return out;
}

/** Clock-driven events, expressed entirely through the repo's existing phase model — so
    kickoff crossings and the full-time inference inherit matchPhase's honesty for free. */
export function phaseTransitions(
  items: (PhaseInput & { match_id: number })[],
  prevNow: number | null,
  now: number,
): { matchId: number; from: MatchPhase; to: MatchPhase }[] {
  if (prevNow === null || now <= prevNow) return []; // first tick, duplicate tick, or a
  // backwards clock (DST, a tab waking)
  const out: { matchId: number; from: MatchPhase; to: MatchPhase }[] = [];
  for (const i of items) {
    const from = matchPhase({ ...i, now: prevNow });
    const to = matchPhase({ ...i, now });
    if (from !== to) out.push({ matchId: i.match_id, from, to });
  }
  return out;
}
