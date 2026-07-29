// Root layout: floodlight backdrop, nav, health banners, routed outlet, footer.
// Evidence scopes are never merged anywhere in this app: every metric renders with its
// scope + sample size (T-171). One shared upcoming fetch powers all liveness surfaces.
import { useEffect, useState, type ReactNode } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { api, type Health } from "./api";
import { HealthBanners } from "./components/layout/HealthBanners";
import { HealthContext } from "./components/layout/HealthContext";
import { SiteFooter } from "./components/layout/SiteFooter";
import { TopNav } from "./components/layout/TopNav";
import { UpcomingProvider } from "./components/layout/UpcomingContext";

// Route transition: pure-CSS enter-only on a fresh <main> per pathname (the key is set by
// App). First paint never animates — the flag flips after the first mount, so only actual
// navigations get the settle. Also the app's first <main> landmark (a11y fix).
let firstLoadDone = false;

function RouteMain({ children }: { children: ReactNode }) {
  // computed once per mount; the pathname key remounts this component on navigation
  const [animate] = useState(() => firstLoadDone);
  useEffect(() => {
    firstLoadDone = true;
  }, []);
  return (
    <main id="content" className={animate ? "route-enter" : undefined}>
      {children}
    </main>
  );
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setApiDown(true));
  }, []);

  // the section-register hook (styles/sections.css) + disambiguates duplicate section
  // ids across pages (home and performance both emit #evidence)
  const page = pathname.split("/")[1] || "home";

  return (
    <HealthContext.Provider value={{ health, apiDown }}>
      <UpcomingProvider>
        <div className="floodlights" aria-hidden />
        <TopNav />
        <div className="shell" data-page={page}>
          {/* banners live in a leaf: their relative-time tick must not re-render pages */}
          <HealthBanners />
          <RouteMain key={pathname}>
            <Outlet />
          </RouteMain>
          <SiteFooter />
        </div>
        <ScrollRestoration />
      </UpcomingProvider>
    </HealthContext.Provider>
  );
}
