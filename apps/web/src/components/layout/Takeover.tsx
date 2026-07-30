// The broadcast lower-third. When something actually happens — a forecast freezes, grades land,
// a sealed value changes — a full-width strap slides in, holds, and leaves.
//
// It lives in App, NOT inside the Ticker. It was inside the ticker strip at first, which meant
// the only liveFeed subscriber was unmounted on the two reference pages and any time the ticker
// had no items — so an event landing then was lost permanently, with nothing to announce it and
// no second chance. A leaf in App exists on every route.
//
// It can only ever be driven by a witnessed state transition: lib/liveEvents' diffs return []
// when there is no previous snapshot. What it is allowed to SAY is decided by lib/liveCopy,
// which has a unit test asserting it never claims "just now".
//
// No AnimatePresence: docs/motion.md rejected mode="wait" for gating content, and 20 lines of
// CSS is more robust and 15-25 kB cheaper.
import { useEffect, useRef, useState } from "react";
import { cutoffOf } from "../../lib/format";
import { composeTakeover, type Takeover as Model } from "../../lib/liveCopy";
import { subscribeLive } from "./liveFeed";
import { useUpcoming } from "./UpcomingContext";

const IN_MS = 380;
const HOLD_MS = 4600;
const OUT_MS = 260;

export function Takeover() {
  const { list } = useUpcoming();
  const [model, setModel] = useState<Model | null>(null);
  const [leaving, setLeaving] = useState(false);
  const listRef = useRef(list);
  listRef.current = list;

  useEffect(() => {
    // one-shot timeouts bounded by a single event — permitted by docs/motion.md rule 7's named
    // exemption (HashProof's compute floor is the same class). Not a timer regime.
    let holdT: ReturnType<typeof setTimeout> | null = null;
    let outT: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeLive((events) => {
      const next = composeTakeover(events, (id) => {
        const m = listRef.current?.find((x) => x.match_id === id);
        return m ? cutoffOf(m.kickoff_utc) : null;
      });
      if (!next) return;
      if (holdT) clearTimeout(holdT);
      if (outT) clearTimeout(outT);
      setLeaving(false);
      setModel(next);
      holdT = setTimeout(() => setLeaving(true), IN_MS + HOLD_MS);
      outT = setTimeout(() => {
        setModel(null);
        setLeaving(false);
      }, IN_MS + HOLD_MS + OUT_MS);
    });
    return () => {
      off();
      if (holdT) clearTimeout(holdT);
      if (outT) clearTimeout(outT);
    };
  }, []);

  // The live region is ALWAYS mounted and only its contents change. A role="status" element
  // that appears at the same moment as its text is announced unreliably — assistive tech has
  // to be observing the region before the mutation happens.
  return (
    <div className="tk-region" role="status" aria-live="polite">
      {model && (
        <div
          className={`tk tk-${model.tone}${leaving ? " leaving" : ""}`}
          style={{
            ["--tk-in" as string]: `${IN_MS}ms`,
            ["--tk-out" as string]: `${OUT_MS}ms`,
          }}
        >
          <span className="tk-head">{model.head}</span>
          <span className="tk-sub">{model.sub}</span>
        </div>
      )}
    </div>
  );
}
