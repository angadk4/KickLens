import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
// wdth.css (NOT index.css): the only build carrying the width axis the display cut needs
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import App from "./App";
import { CalibrationPage } from "./features/calibration/CalibrationPage";
import { ForecastsPage } from "./features/forecasts/ForecastsPage";
import { HomePage } from "./features/home/HomePage";
import { MatchPage } from "./features/match/MatchPage";
import { MethodologyPage } from "./features/methodology/MethodologyPage";
import { NotFound } from "./features/NotFound";
import { PerformancePage } from "./features/performance/PerformancePage";
import { RatingsPage } from "./features/ratings/RatingsPage";
import { RecordPage } from "./features/record/RecordPage";

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
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  </StrictMode>,
);
