// ONE /matches/upcoming fetch shared by the nav mini-countdown, the hero, the ticker,
// and the KPI live-status cell. The refetch-once-after-publication behavior lives here so
// every consumer refreshes together. No polling — the endpoint is 60s-cacheable anyway.
//
// "Next official freeze" = the earliest fixture NOT YET on the record. A fixture stays the
// target until it is actually official-frozen — NOT the instant its cutoff passes — so the
// countdown never skips ahead of a fixture that hasn't visibly frozen. The countdown itself
// targets the cutoff (kickoff−3h, when inputs lock); once it passes, consumers show the
// honest "locked · anchoring at the next run" state until the frozen record appears.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, type UpcomingMatch } from "../../api";
import { cutoffOf, freezeRunOf } from "../../lib/format";

type UpcomingState = {
  list: UpcomingMatch[] | null;
  /** cutoff (kickoff−3h) of the next fixture not yet on the record */
  nextCutoff: Date | null;
  nextMatch: UpcomingMatch | null;
};

const Ctx = createContext<UpcomingState>({ list: null, nextCutoff: null, nextMatch: null });

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
  const [list, setList] = useState<UpcomingMatch[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // bounds the recheck loop during a pending-publication window so a stuck freeze can't poll forever
  const pending = useRef<{ id: number; tries: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .upcoming()
        .then((l) => {
          if (!alive) return;
          setList(l);
          const next = computeNext(l);
          if (timer.current) clearTimeout(timer.current);
          if (!next) return;
          // the official record is written at the first hourly run at/after the cutoff;
          // refetch ~90s after that to pick up the frozen status and advance the queue
          const publishAt = freezeRunOf(next.cutoff).getTime() + 90_000;
          const future = publishAt - Date.now();
          if (future > 0) {
            pending.current = { id: next.m.match_id, tries: 0 };
            timer.current = setTimeout(load, future);
          } else {
            // pending-publication window: recheck every 60s, bounded to ~20 min
            const st =
              pending.current?.id === next.m.match_id
                ? pending.current
                : { id: next.m.match_id, tries: 0 };
            if (st.tries < 20) {
              pending.current = { id: st.id, tries: st.tries + 1 };
              timer.current = setTimeout(load, 60_000);
            } else {
              pending.current = st; // give up quietly — alarms/canary handle a real stall
            }
          }
        })
        .catch(() => {
          if (alive) setList(null); // consumers degrade gracefully
        });
    };
    load();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const value = useMemo<UpcomingState>(() => {
    const next = list ? computeNext(list) : null;
    return { list, nextCutoff: next?.cutoff ?? null, nextMatch: next?.m ?? null };
  }, [list]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
