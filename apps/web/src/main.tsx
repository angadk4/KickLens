// boot FIRST, before react-dom, the router and every page module evaluates: ES modules run in
// import order, so this is the earliest legal point to put the shell's four requests on the
// wire. On a scale-to-zero backend the first request pays the database wake, and starting it a
// few hundred milliseconds sooner is the one thing the client can do about that.
// (CSP script-src 'self' rules out an inline <script> in index.html, which would be earlier.)
import "./lib/boot";
import { StrictMode, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
// standard.css: the build carrying wght + wdth + opsz — the display cut needs the width axis
import "@fontsource-variable/bricolage-grotesque/standard.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/sections.css";
import App from "./App";
import { registerRouteChunks } from "./lib/routeWarm";
// index.html ships an empty <div id="root">, so NOTHING paints until the entry chunk has
// downloaded, parsed, compiled and run. Every route used to be in that chunk — including
// recharts and its Redux/immer/d3 subtree, which only three pages ever paint. Splitting the
// nine non-home routes moves ~42% of the bundle off the first-paint path.
//
// HomePage stays EAGER on purpose: it is the landing route and the LCP-critical one, so giving
// it an extra serial round trip would trade first paint for a smaller chunk — the wrong way
// round. The pages use named exports, hence the .then shim on each.
import { HomePage } from "./features/home/HomePage";

const CalibrationPage = lazy(() =>
  import("./features/calibration/CalibrationPage").then((m) => ({ default: m.CalibrationPage })),
);
const EngineeringPage = lazy(() =>
  import("./features/engineering/EngineeringPage").then((m) => ({ default: m.EngineeringPage })),
);
const ForecastsPage = lazy(() =>
  import("./features/forecasts/ForecastsPage").then((m) => ({ default: m.ForecastsPage })),
);
const MatchPage = lazy(() =>
  import("./features/match/MatchPage").then((m) => ({ default: m.MatchPage })),
);
const MethodologyPage = lazy(() =>
  import("./features/methodology/MethodologyPage").then((m) => ({ default: m.MethodologyPage })),
);
const NotFound = lazy(() =>
  import("./features/NotFound").then((m) => ({ default: m.NotFound })),
);
const PerformancePage = lazy(() =>
  import("./features/performance/PerformancePage").then((m) => ({ default: m.PerformancePage })),
);
const RatingsPage = lazy(() =>
  import("./features/ratings/RatingsPage").then((m) => ({ default: m.RatingsPage })),
);
const RecordPage = lazy(() =>
  import("./features/record/RecordPage").then((m) => ({ default: m.RecordPage })),
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "forecasts", element: <ForecastsPage /> },
      { path: "match/:id", element: <MatchPage /> },
      { path: "record", element: <RecordPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "calibration", element: <CalibrationPage /> },
      { path: "ratings", element: <RatingsPage /> },
      { path: "methodology", element: <MethodologyPage /> },
      { path: "engineering", element: <EngineeringPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Only the three chart routes register a chunk warmer: they share a 333 KB recharts chunk, and
// pulling it on nav intent is the difference between a chart that is already there and one that
// arrives. The other page chunks are 3-30 KB and land faster than a click.
//
// A blanket idle-prefetch of all nine was tried and REMOVED: it put ~600 KB of parse work back
// on the main thread right after first paint and raised the worst long task from 194ms to 263ms
// at 4x throttle — re-creating the jank this pass exists to remove.
registerRouteChunks({
  "/performance": () => import("./features/performance/PerformancePage"),
  "/calibration": () => import("./features/calibration/CalibrationPage"),
  "/ratings": () => import("./features/ratings/RatingsPage"),
});
