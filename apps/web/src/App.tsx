// Root layout: floodlight backdrop, nav, health banners, routed outlet, footer.
// Evidence scopes are never merged anywhere in this app: every metric renders with its
// scope + sample size (T-171). One shared upcoming fetch powers all liveness surfaces.
import { useEffect, useState, type ReactNode } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { CommandPalette } from "./components/layout/CommandPalette";
import { Floodlights } from "./components/layout/Floodlights";
import { HealthBanners } from "./components/layout/HealthBanners";
import { SiteFooter } from "./components/layout/SiteFooter";
import { Takeover } from "./components/layout/Takeover";
import { Ticker } from "./components/layout/Ticker";
import { TopNav } from "./components/layout/TopNav";
import { UpcomingProvider } from "./components/layout/UpcomingContext";

// Route transition: pure-CSS enter-only on a fresh <main> per pathname (the key is set by
// App). First paint never animates — the flag flips after the first mount, so only actual
// navigations get the settle. Also the app's first <main> landmark (a11y fix).
let firstLoadDone = false;

/** No live crawl on the two pages whose every number is a static, dated fact. */
const REFERENCE_PAGES = new Set(["methodology", "engineering"]);

function RouteMain({ children }: { children: ReactNode }) {
  // computed once per mount; the pathname key remounts this component on navigation
  const [animate] = useState(() => firstLoadDone);
  useEffect(() => {
    firstLoadDone = true;
  }, []);
  return (
    // tabIndex −1: the skip link's #content target must be programmatically focusable
    <main id="content" tabIndex={-1} className={animate ? "route-enter" : undefined}>
      {children}
    </main>
  );
}

export default function App() {
  const { pathname } = useLocation();

  // the section-register hook (styles/sections.css) + disambiguates duplicate section
  // ids across pages (home and performance both emit #evidence)
  const page = pathname.split("/")[1] || "home";

  // /health is fetched by UpcomingContext's shared poll now and published through a module
  // store, so it refreshes on matchday instead of ageing from one mount-time fetch. App does
  // not read it: subscribing here would re-render every page on every poll.
  return (
    <>
      <UpcomingProvider>
        {/* first tab stop on every page — parked offscreen until keyboard focus lands */}
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <Floodlights page={page} />
        <TopNav />
        <div className="shell" data-page={page}>
          {/* banners live in a leaf: their relative-time tick must not re-render pages */}
          <HealthBanners />
          {/* the event channel's announcement surface: a leaf on EVERY route, so an event can
              never land on a page that has nobody listening */}
          <Takeover />
          {/* ⌘K — a leaf beside the takeover for the same reason: opening it must not
              re-render pages. Renders nothing until opened. */}
          <CommandPalette />
          {/* The crawl is the site's event channel, so it has to exist wherever an event
              could land — a freeze landing while someone reads /record previously had nowhere
              to go. Excluded on the two REFERENCE pages (styles/sections.css): their numbers
              are static, dated facts, and a live crawl there would contradict the register.
              (The register's two sanctioned exceptions — the operations board and activity
              feed on /engineering — render live data AS records; a crawl announces. The
              distinction is documented at the register comment.) In document flow, not
              sticky: a sticky 36px strip under a sticky nav eats 4% of a 390×844 viewport. */}
          {!REFERENCE_PAGES.has(page) && <Ticker />}
          <RouteMain key={pathname}>
            <Outlet />
          </RouteMain>
          <SiteFooter />
        </div>
        <ScrollRestoration />
      </UpcomingProvider>
    </>
  );
}
