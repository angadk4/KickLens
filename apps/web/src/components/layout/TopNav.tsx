import { useEffect, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useCountdown } from "../../lib/useCountdown";
import { useHealth } from "./HealthContext";
import { useUpcoming } from "./UpcomingContext";

/** ⏱ next-freeze mini-countdown — the nav's live pulse (hidden on home: the hero owns it) */
function NavFreeze() {
  const { nextCutoff } = useUpcoming();
  const cd = useCountdown(nextCutoff);
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
  return (
    <div className={`topnav${scrolled ? " scrolled" : ""}`}>
      <div className="topnav-inner">
        <Link to="/" className="wordmark">
          <img src="/favicon.svg" alt="" />
          KickLens
        </Link>
        <nav className="nav-links" aria-label="Primary">
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
