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

const MATCHDAY_POLL_MS = 180_000;

type UpcomingState = {
  list: UpcomingMatch[] | null;
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
    const load = () => {
      Promise.allSettled([api.upcoming(), api.inPlay(), api.completed(1)]).then(
        ([u, ip, c]) => {
          if (!alive) return;
          const anyFailed =
            u.status === "rejected" || ip.status === "rejected" || c.status === "rejected";
          failures.current = anyFailed ? failures.current + 1 : 0;
          // merge, never replace: a transient failure keeps the last-known truth on screen
          // instead of blanking a live board (the data is at worst one poll interval old)
          const list = u.status === "fulfilled" ? u.value : latest.current.list;
          const inPlay = ip.status === "fulfilled" ? ip.value : latest.current.inPlay;
          const totalGraded =
            c.status === "fulfilled" ? c.value.total_graded : latest.current.totalGraded;
          latest.current = { list, inPlay, totalGraded };
          setState(latest.current);
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
    return () => {
      alive = false;
      if (freezeT) clearTimeout(freezeT);
      if (pollT) clearTimeout(pollT);
    };
  }, []);

  const value = useMemo<UpcomingState>(() => {
    const next = state.list ? computeNext(state.list) : null;
    return {
      list: state.list,
      nextCutoff: next?.cutoff ?? null,
      nextMatch: next?.m ?? null,
      inPlay: state.inPlay,
      totalGraded: state.totalGraded,
    };
  }, [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
