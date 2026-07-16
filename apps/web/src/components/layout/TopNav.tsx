import { useEffect, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useHealth } from "./HealthContext";

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
        <span className="health-dot" title={`system status: ${dotLabel}`}>
          <span className={`dot ${dotClass}`} aria-hidden />
          {dotLabel}
        </span>
      </div>
    </div>
  );
}
