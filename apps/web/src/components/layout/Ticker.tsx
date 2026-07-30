// The record accruing, as a quiet broadcast ticker under the halfway line (home only).
// CSS marquee over a duplicated track; pauses on hover/focus; IO-gated offscreen;
// reduced motion / no-JS renders a static row. An SR-visible static list carries the
// same content. Zero extra API calls: items come from the shared upcoming + health data.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { shortHash, teamName } from "../../lib/format";
import { tickerDuration } from "../../lib/ticker";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useNow, useRelativeTime } from "../../lib/useRelativeTime";
import { useHealth } from "./HealthContext";
import { useUpcoming } from "./UpcomingContext";

// per-minute text — the hero owns seconds. `now` comes from the ONE shared clock: this
// used to be a component with its own setInterval, one per non-frozen ticker item (≤6).
function freezeIn(cutoff: Date, now: number): string {
  // floor, not round: the ticker must never disagree upward with the hero's seconds
  const mins = Math.max(0, Math.floor((cutoff.getTime() - now) / 60_000));
  const h = Math.floor(mins / 60);
  // past cutoff = locked, awaiting the next hourly run's anchor — not literally "now"
  return mins <= 0
    ? "freeze pending"
    : h >= 48
      ? `freezes in ${Math.floor(h / 24)}d ${h % 24}h` // days read better than "68h"
      : h > 0
        ? `freezes in ${h}h ${mins % 60}m`
        : `freezes in ${mins}m`;
}

export function Ticker() {
  // the already-kicked-off fixtures are filtered out upstream: a running match must never
  // scroll past as "freezes in 0m"
  const { upcoming } = useUpcoming();
  const { health } = useHealth();
  const ingested = useRelativeTime(health?.last_ingest);
  const now = useNow();
  const ref = useRef<HTMLElement>(null);
  const setRef = useRef<HTMLSpanElement>(null);
  const [running, setRunning] = useState(false);
  const [setWidth, setSetWidth] = useState(0);
  // live-subscribing: flipping the OS setting takes effect immediately — both the old
  // one-shot .matches read AND framer's useReducedMotion freeze the choice at mount
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  const items = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (const m of (upcoming ?? []).slice(0, 6)) {
      const frozen = m.forecast?.type === "official-frozen";
      out.push(
        <Link key={`m${m.match_id}`} to={`/match/${m.match_id}`} className="ticker-item">
          {frozen ? (
            <>
              <span className="t-gold">⬡</span>
              {teamName(m.home)} vs {teamName(m.away)} — frozen
              {m.forecast?.forecast_hash ? ` · ${shortHash(m.forecast.forecast_hash, 8)}` : ""}
            </>
          ) : (
            <>
              {teamName(m.home)} vs {teamName(m.away)} —{" "}
              {freezeIn(new Date(new Date(m.kickoff_utc).getTime() - 3 * 3600 * 1000), now)}
            </>
          )}
        </Link>,
      );
    }
    if (health?.last_ingest) {
      out.push(
        <span key="ingest" className="ticker-item" title={health.last_ingest}>
          <span className="pulse-dot" aria-hidden /> results ingested {ingested}
        </span>,
      );
    }
    return out;
  }, [upcoming, health, ingested, now]);

  const hasItems = items.length > 0;

  // `hasItems` is in the dep array and it is LOAD-BEARING. The component returns null until
  // the shared fetch resolves, so at mount `ref.current` is null and the observer was never
  // created — and with a `[reduced]`-only dep array the effect never re-ran once the section
  // finally rendered. Result: `running` stayed false forever and THE TICKER NEVER SCROLLED
  // ON FIRST LOAD. Measured, not theorised: .devtools/motion.sh reported 7 ticker items, no
  // `.running` class, and no `ticker-scroll` animation 6s after load.
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasItems || reduced || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setRunning(!!e?.isIntersecting));
    io.observe(el);
    return () => {
      io.disconnect();
      setRunning(false);
    };
  }, [reduced, hasItems]);

  // one measurement of the first set, re-taken on resize/font swap — the same idiom
  // BaselineLadder and ProbBar already use. No loop, no per-frame work.
  useEffect(() => {
    const el = setRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSetWidth(el.scrollWidth));
    ro.observe(el);
    setSetWidth(el.scrollWidth);
    return () => ro.disconnect();
  }, [hasItems]);

  if (!hasItems) return null;

  return (
    <section
      ref={ref}
      className={`ticker${running ? " running" : ""}`}
      aria-label="Upcoming freezes"
      // duration from the MEASURED set width, so the crawl runs at a constant px/s
      // regardless of how many items there are or how long their text is (lib/ticker.ts)
      style={{ ["--ticker-dur" as string]: `${tickerDuration(setWidth)}s` }}
    >
      {/* SR + no-JS + reduced-motion: the plain row IS the content */}
      <div className="ticker-track">
        <span className="ticker-set" ref={setRef}>
          {items}
        </span>
        {running && (
          // `inert` as well as aria-hidden: the duplicate carries real <Link>s, so
          // aria-hidden alone left a set of invisible-but-TABBABLE links in the tab order —
          // now on every route rather than just home. inert removes them from it entirely.
          <span className="ticker-set" aria-hidden inert>
            {items /* duplicated set for the seamless loop */}
          </span>
        )}
      </div>
    </section>
  );
}
