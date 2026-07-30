// ONE shared fetch of the liveness surfaces — /matches/upcoming + /matches/in-play + the
// graded total — powering the nav mini-countdown, the hero, the ticker, the KPI status
// cell, and the in-play band. The refetch-once-after-publication behavior lives here so
// every consumer refreshes together. No steady-state polling (Neon scale-to-zero; the
// endpoints are 60s-cacheable) — with ONE exception: while games sit in the kickoff→grade
// window we refetch every 3 minutes, so an open tab sees results and grades land. The
// poll stops the moment the in-play band empties.
//
// "Next official freeze" = the earliest fixture NOT YET on the record. A fixture stays the
// target until it is actually official-frozen — NOT the instant its cutoff passes — so the
// countdown never skips ahead of a fixture that hasn't visibly frozen. The countdown itself
// targets the cutoff (kickoff−3h, when inputs lock); once it passes, consumers show the
// honest "locked · anchoring at the next run" state until the frozen record appears.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, type InPlayItem, type UpcomingMatch } from "../../api";
import { cutoffOf, freezeRunOf } from "../../lib/format";
import { boardSnapshot, diffBoard, phaseTransitions, type BoardSnapshot } from "../../lib/liveEvents";
import { notYetKickedOff } from "../../lib/matchPhase";
import { useNow } from "../../lib/useRelativeTime";
import { setHealth } from "./healthStore";
import { publishLive } from "./liveFeed";

const MATCHDAY_POLL_MS = 180_000;

type UpcomingState = {
  /** every fixture the last fetch returned — includes any that has kicked off since */
  list: UpcomingMatch[] | null;
  /** `list` minus fixtures already kicked off, recomputed on the shared clock tick. Every
      surface that renders "upcoming" fixtures reads THIS, so none can disagree. */
  upcoming: UpcomingMatch[] | null;
  /** cutoff (kickoff−3h) of the next fixture not yet on the record */
  nextCutoff: Date | null;
  nextMatch: UpcomingMatch | null;
  /** official forecasts whose match kicked off but isn't graded yet */
  inPlay: InPlayItem[] | null;
  /** live count of graded officials (/predictions/completed) — the ONE source for the
      "live graded" number everywhere, so pages can never disagree */
  totalGraded: number | null;
};

const EMPTY: UpcomingState = {
  list: null,
  upcoming: null,
  nextCutoff: null,
  nextMatch: null,
  inPlay: null,
  totalGraded: null,
};

const Ctx = createContext<UpcomingState>(EMPTY);

export function useUpcoming(): UpcomingState {
  return useContext(Ctx);
}

/** The earliest fixture without an official-frozen forecast. A past-cutoff fixture is kept
    (it's locked but not yet published) until its frozen record lands — so the queue advances
    on actual freeze, not on the cutoff clock. */
function computeNext(list: UpcomingMatch[]): { cutoff: Date; m: UpcomingMatch } | null {
  const candidates = list
    .filter((m) => m.forecast?.type !== "official-frozen")
    .map((m) => ({ m, cutoff: cutoffOf(m.kickoff_utc) }))
    .sort((a, b) => a.cutoff.getTime() - b.cutoff.getTime());
  return candidates[0] ?? null;
}

export function UpcomingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    list: UpcomingMatch[] | null;
    inPlay: InPlayItem[] | null;
    totalGraded: number | null;
  }>({ list: null, inPlay: null, totalGraded: null });
  // bounds the recheck loop during a pending-publication window so a stuck freeze can't poll forever
  const pending = useRef<{ id: number; tries: number } | null>(null);
  // bounds the transient-failure retry loop (a Neon cold start must not kill the poll —
  // nor may a dead API poll forever)
  const failures = useRef(0);
  // mirror of the latest committed state, for merge-on-failure without updater side effects
  const latest = useRef<{
    list: UpcomingMatch[] | null;
    inPlay: InPlayItem[] | null;
    totalGraded: number | null;
  }>({ list: null, inPlay: null, totalGraded: null });
  // the previous board projection, for the pure event diff (lib/liveEvents)
  const prevSnap = useRef<BoardSnapshot | null>(null);
  // lets a clock-driven kickoff crossing ask for an immediate refetch, debounced
  const requestLoad = useRef<(() => void) | null>(null);
  const lastRequested = useRef(0);

  useEffect(() => {
    let alive = true;
    // effect-local timer handles (not refs): the cleanup closes over exactly these
    let freezeT: ReturnType<typeof setTimeout> | null = null;
    let pollT: ReturnType<typeof setTimeout> | null = null;
    const armFreeze = (fn: () => void, ms: number) => {
      // setTimeout treats delays > int32 max (~24.8 days) as 0 — clamp long fixture gaps
      freezeT = setTimeout(fn, Math.min(Math.max(ms, 0), 0x7fffffff));
    };
    const armPoll = (fn: () => void, ms: number) => {
      pollT = setTimeout(fn, Math.min(Math.max(ms, 0), 0x7fffffff));
    };
    // An in-flight guard. Two paths can call load() at once (an armed timer plus the
    // kickoff-crossing refetch), and concurrent responses would each diff against — and then
    // overwrite — prevSnap, so the SAME freeze could be announced twice. One at a time; the
    // armed timers re-fire anyway, so nothing is lost by skipping.
    let inFlight = false;
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      // /health rides along: it used to be fetched once at App mount and never again, so
      // "ingested 4h ago" aged without refreshing on a long-open tab (healthStore.ts).
      Promise.allSettled([api.upcoming(), api.inPlay(), api.completed(1), api.health()]).then(
        ([u, ip, c, h]) => {
          inFlight = false;
          if (!alive) return;
          // A /health-only failure must NOT claim "API unreachable": three other endpoints
          // answering is proof the API is up. Blanking health on its own failure also lost the
          // last-known freshness AND raised the banner, so a single flaky call libelled a
          // healthy system. Only a total failure means down; otherwise keep what we knew.
          const healthOk = h.status === "fulfilled";
          const allFailed =
            !healthOk &&
            u.status === "rejected" &&
            ip.status === "rejected" &&
            c.status === "rejected";
          if (healthOk) setHealth({ health: h.value, apiDown: false });
          else if (allFailed) setHealth({ health: null, apiDown: true });
          // health is part of the failure count, so a retry gets armed for it too
          const anyFailed =
            u.status === "rejected" ||
            ip.status === "rejected" ||
            c.status === "rejected" ||
            !healthOk;
          failures.current = anyFailed ? failures.current + 1 : 0;
          // merge, never replace: a transient failure keeps the last-known truth on screen
          // instead of blanking a live board (the data is at worst one poll interval old)
          const list = u.status === "fulfilled" ? u.value : latest.current.list;
          const inPlay = ip.status === "fulfilled" ? ip.value : latest.current.inPlay;
          const totalGraded =
            c.status === "fulfilled" ? c.value.total_graded : latest.current.totalGraded;
          latest.current = { list, inPlay, totalGraded };

          // ---- the event layer. This is a CALLBACK, not a render, so publishing here is
          // legal. diffBoard returns [] when prevSnap is null, which is the entire "never
          // announce on page load" rule — and it also makes StrictMode's double load silent,
          // because the second load produces an identical snapshot.
          const meta: Record<number, { home: string; away: string; kickoff: string }> = {};
          for (const m of list ?? []) {
            meta[m.match_id] = { home: m.home, away: m.away, kickoff: m.kickoff_utc };
          }
          const nextSnap = boardSnapshot(list, inPlay, totalGraded);
          const events = diffBoard(prevSnap.current, nextSnap, meta);
          prevSnap.current = nextSnap;

          setState(latest.current);
          publishLive(events);
          if (freezeT) clearTimeout(freezeT);
          if (pollT) clearTimeout(pollT);

          // matchday: refetch on a slow loop while anything sits between kickoff and grade,
          // so results/grades appear without a reload; stops when the band empties. A
          // failed fetch retries on the same cadence, bounded — then quiet until reload.
          const koSoon = (list ?? [])
            .filter((m) => m.forecast?.type === "official-frozen")
            .map((m) => new Date(m.kickoff_utc).getTime() - Date.now())
            .sort((a, b) => a - b)[0];
          if ((inPlay && inPlay.length > 0) || (anyFailed && failures.current <= 20)) {
            armPoll(load, MATCHDAY_POLL_MS);
          } else if (koSoon !== undefined && koSoon > 0) {
            // a sealed fixture is approaching kickoff: wake AT kickoff so an already-open
            // tab enters matchday state by itself (nothing else fires at that moment)
            armPoll(load, koSoon + 90_000);
          }

          const next = list ? computeNext(list) : null;
          if (!next) return;
          // the official record is written at the first hourly run at/after the cutoff;
          // refetch ~90s after that to pick up the frozen status and advance the queue
          const publishAt = freezeRunOf(next.cutoff).getTime() + 90_000;
          const future = publishAt - Date.now();
          if (future > 0) {
            pending.current = { id: next.m.match_id, tries: 0 };
            armFreeze(load, future);
          } else {
            // pending-publication window: recheck every 60s, bounded to ~20 min
            const st =
              pending.current?.id === next.m.match_id
                ? pending.current
                : { id: next.m.match_id, tries: 0 };
            if (st.tries < 20) {
              pending.current = { id: st.id, tries: st.tries + 1 };
              armFreeze(load, 60_000);
            } else {
              pending.current = st; // give up quietly — alarms/canary handle a real stall
            }
          }
        },
      );
    };
    load();
    requestLoad.current = load;
    return () => {
      alive = false;
      requestLoad.current = null;
      if (freezeT) clearTimeout(freezeT);
      if (pollT) clearTimeout(pollT);
    };
  }, []);

  // the wall-clock tick that ages `upcoming` past each kickoff with zero network
  const now = useNow();

  // ---- clock-driven events. A kickoff crossing is derivable with zero network, and it is
  // the one moment nothing else fires: the wake-at-kickoff timer is armed from data captured
  // at FETCH time, so a tab open across a kickoff could otherwise wait up to a full 3-minute
  // poll before the in-play band appeared. One extra request, a handful of times a week.
  const prevNow = useRef<number | null>(null);
  useEffect(() => {
    const items = (state.list ?? []).map((m) => ({
      match_id: m.match_id,
      kickoff_utc: m.kickoff_utc,
      frozen: m.forecast?.type === "official-frozen",
    }));
    const transitions = phaseTransitions(items, prevNow.current, now);
    prevNow.current = now;
    if (transitions.length === 0) return;
    publishLive(transitions.map((t) => ({ kind: "phase" as const, ...t })));
    const kickedOff = transitions.some((t) => t.to === "in-play");
    if (kickedOff && now - lastRequested.current > 30_000) {
      lastRequested.current = now;
      requestLoad.current?.();
    }
  }, [now, state.list]);
  const value = useMemo<UpcomingState>(() => {
    const next = state.list ? computeNext(state.list) : null;
    return {
      list: state.list,
      upcoming: state.list ? notYetKickedOff(state.list, now) : null,
      nextCutoff: next?.cutoff ?? null,
      nextMatch: next?.m ?? null,
      inPlay: state.inPlay,
      totalGraded: state.totalGraded,
    };
  }, [state, now]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
