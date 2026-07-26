import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useCountdown } from "../../lib/useCountdown";
import { useHealth } from "./HealthContext";
import { useUpcoming } from "./UpcomingContext";

/** ⏱ next-freeze mini-countdown — the nav's live pulse (hidden on home: the hero owns it).
    During a matchday the freeze may be days away while games run NOW — the live state wins. */
function NavFreeze() {
  const { nextCutoff, inPlay } = useUpcoming();
  const cd = useCountdown(nextCutoff);
  if (inPlay && inPlay.length > 0)
    return (
      <Link
        to="/record"
        className="nav-freeze freezing"
        title="Games between kickoff and the record — sealed forecasts awaiting results"
      >
        matchday · {inPlay.length} running
      </Link>
    );
  if (!nextCutoff) return null;
  if (cd.expired)
    return (
      <Link to="/forecasts" className="nav-freeze freezing" title="Inputs locked; the official forecast anchors at the next hourly run">
        freeze pending
      </Link>
    );
  const pad = (n: number) => String(n).padStart(2, "0");
  const text =
    cd.d > 0 ? `${cd.d}d ${pad(cd.h)}:${pad(cd.m)}` : `${pad(cd.h)}:${pad(cd.m)}:${pad(cd.s)}`;
  return (
    <Link to="/forecasts" className="nav-freeze" title="Next official freeze (kickoff−3h)">
      next freeze {text}
    </Link>
  );
}

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/forecasts", label: "Forecasts" },
  { to: "/record", label: "Record" },
  { to: "/performance", label: "Performance" },
  { to: "/calibration", label: "Calibration" },
  { to: "/ratings", label: "Ratings" },
  { to: "/methodology", label: "Methodology" },
  { to: "/engineering", label: "Engineering" },
];

export function TopNav() {
  const { health, apiDown } = useHealth();
  const { pathname } = useLocation();
  const onMatchPage = pathname.startsWith("/match/");
  const dotClass = apiDown ? "bad" : health && !health.freshness_ok ? "stale" : "";
  const dotLabel = apiDown ? "api down" : health ? (health.freshness_ok ? "live" : "stale") : "…";
  // the nav floats (shadow) only once the page has scrolled under it
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Below 720px the rail scrolls horizontally and half the links start off-screen — on
  // /engineering the ACTIVE tab sat 300px past the right edge, so the current page looked
  // unreachable. Bring the active tab into view (own scrollLeft only — never
  // scrollIntoView, which would also scroll the document), and fade whichever edge still
  // has links beyond it, so a label never dies mid-word and the fade always MEANS "more
  // this way" — same both-edges idiom as the ticker.
  const railRef = useRef<HTMLElement>(null);
  const [railMask, setRailMask] = useState<string>("none");
  const syncRail = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const more = rail.scrollWidth - rail.clientWidth;
    const left = more > 1 && rail.scrollLeft > 1;
    const right = more > 1 && rail.scrollLeft < more - 1;
    setRailMask(
      left || right
        ? `linear-gradient(90deg, ${left ? "transparent, #000 32px" : "#000"}, ${
            right ? "#000 calc(100% - 32px), transparent" : "#000"
          })`
        : "none",
    );
  }, []);
  const revealActive = useCallback(() => {
    const rail = railRef.current;
    const active = rail?.querySelector("a.active");
    if (rail && active) {
      const railBox = rail.getBoundingClientRect();
      const tabBox = active.getBoundingClientRect();
      const pad = 40; // clear the rail's own padding and the right-edge fade
      if (tabBox.right > railBox.right - pad) {
        rail.scrollLeft += tabBox.right - (railBox.right - pad);
      } else if (tabBox.left < railBox.left + pad) {
        rail.scrollLeft -= railBox.left + pad - tabBox.left;
      }
    }
    syncRail();
  }, [syncRail]);
  useEffect(() => {
    let cancelled = false;
    const rerun = () => {
      if (!cancelled) revealActive();
    };
    rerun();
    // the display face loads after first paint and widens the rail by ~70px — without a
    // second pass the mount-time scroll lands short and the active tab is still cut off
    document.fonts?.ready.then(rerun, () => {});
    window.addEventListener("resize", rerun);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", rerun);
    };
  }, [pathname, revealActive]);

  return (
    <div className={`topnav${scrolled ? " scrolled" : ""}`}>
      <div className="topnav-inner">
        <Link to="/" className="wordmark">
          <img src="/favicon.svg" alt="" />
          KickLens
        </Link>
        <nav
          className="nav-links"
          aria-label="Primary"
          ref={railRef}
          onScroll={syncRail}
          style={{ maskImage: railMask, WebkitMaskImage: railMask }}
        >
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                isActive || (l.to === "/forecasts" && onMatchPage) ? "active" : ""
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        {pathname !== "/" && <NavFreeze />}
        <span className="health-dot" title={`system status: ${dotLabel}`}>
          <span className={`dot ${dotClass}`} aria-hidden />
          {dotLabel}
        </span>
      </div>
    </div>
  );
}
