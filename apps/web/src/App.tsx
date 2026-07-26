// Root layout: floodlight backdrop, nav, health banners, routed outlet, footer.
// Evidence scopes are never merged anywhere in this app: every metric renders with its
// scope + sample size (T-171). One shared upcoming fetch powers all liveness surfaces.
import { useEffect, useState } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import { api, type Health } from "./api";
import { HealthContext } from "./components/layout/HealthContext";
import { SiteFooter } from "./components/layout/SiteFooter";
import { TopNav } from "./components/layout/TopNav";
import { UpcomingProvider } from "./components/layout/UpcomingContext";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setApiDown(true));
  }, []);

  return (
    <HealthContext.Provider value={{ health, apiDown }}>
      <UpcomingProvider>
        <div className="floodlights" aria-hidden />
        <TopNav />
        <div className="shell">
          {apiDown && (
            <div className="banner error">
              API unreachable — showing nothing rather than something stale without saying so.
            </div>
          )}
          {/* the general staleness notice steps aside when the schedule banner below owns
              the cause — otherwise a dead fixture sweep reads as "data is stale (last
              ingest 40 minutes ago)", which is its own small lie */}
          {health && !health.freshness_ok && health.schedule_fresh !== false && (
            <div className="banner stale">
              Data is stale (last ingest {health.last_ingest ?? "never"}). Forecasts made under
              staleness are tagged.
            </div>
          )}
          {health && health.schedule_fresh === false && (
            <div className="banner stale">
              Fixture schedule not current — the last full fixture sweep finished{" "}
              {health.last_full_ingest ?? "never"}, so upcoming fixtures may be incomplete or
              missing. Frozen forecasts, results, and grading are unaffected.
            </div>
          )}
          <Outlet />
          <SiteFooter />
        </div>
        <ScrollRestoration />
      </UpcomingProvider>
    </HealthContext.Provider>
  );
}
