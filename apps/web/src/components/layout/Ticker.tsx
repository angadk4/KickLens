// The record accruing, as a quiet broadcast ticker under the halfway line (home only).
// CSS marquee over a duplicated track; pauses on hover/focus; IO-gated offscreen;
// reduced motion / no-JS renders a static row. An SR-visible static list carries the
// same content. Zero extra API calls: items come from the shared upcoming + health data.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { shortHash, teamName } from "../../lib/format";
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
  const [running, setRunning] = useState(false);
  // live-subscribing: flipping the OS setting takes effect immediately — both the old
  // one-shot .matches read AND framer's useReducedMotion freeze the choice at mount
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setRunning(!!e?.isIntersecting));
    io.observe(el);
    return () => {
      io.disconnect();
      setRunning(false);
    };
  }, [reduced]);

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

  if (items.length === 0) return null;

  return (
    <section
      ref={ref}
      className={`ticker${running ? " running" : ""}`}
      aria-label="Upcoming freezes"
      style={{ ["--ticker-dur" as string]: `${Math.max(40, items.length * 12)}s` }}
    >
      {/* SR + no-JS + reduced-motion: the plain row IS the content */}
      <div className="ticker-track">
        <span className="ticker-set">{items}</span>
        {running && (
          <span className="ticker-set" aria-hidden>
            {items /* duplicated set for the seamless loop */}
          </span>
        )}
      </div>
    </section>
  );
}
