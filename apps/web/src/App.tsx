// Root layout: top nav, health banners, routed outlet, footer. Evidence scopes are never
// merged anywhere in this app: every metric renders with its scope + sample size (T-171).
import { useEffect, useState } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import { api, type Health } from "./api";
import { HealthContext } from "./components/layout/HealthContext";
import { SiteFooter } from "./components/layout/SiteFooter";
import { TopNav } from "./components/layout/TopNav";

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
      <TopNav />
      <div className="shell">
        {apiDown && (
          <div className="banner error">
            API unreachable — showing nothing rather than something stale without saying so.
          </div>
        )}
        {health && !health.freshness_ok && (
          <div className="banner stale">
            Data is stale (last ingest {health.last_ingest ?? "never"}). Forecasts made under
            staleness are tagged.
          </div>
        )}
        <Outlet />
        <SiteFooter />
      </div>
      <ScrollRestoration />
    </HealthContext.Provider>
  );
}
