// KickLens read-only dashboard (M7 / E20). Evidence scopes are never merged: every metric
// panel is tagged dev / test / backtest / live with its sample size (Contract §2 guarantees).
import { useEffect, useState } from "react";
import { api, type Health } from "./api";
import { Upcoming } from "./components/Upcoming";
import { Archive } from "./components/Archive";
import { Performance } from "./components/Performance";
import { Methodology } from "./components/Methodology";
import "./App.css";

const TABS = ["Upcoming", "Archive", "Performance", "Methodology"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>("Upcoming");
  const [health, setHealth] = useState<Health | null>(null);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setApiDown(true));
  }, []);

  return (
    <div className="shell">
      <header>
        <h1>KickLens</h1>
        <p className="tagline">
          MLS 1X2 forecasts, frozen at kickoff−3h, hashed and publicly anchored. Honest by
          construction.
        </p>
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
        <nav>
          {TABS.map((t) => (
            <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === "Upcoming" && <Upcoming />}
        {tab === "Archive" && <Archive />}
        {tab === "Performance" && <Performance />}
        {tab === "Methodology" && <Methodology />}
      </main>
      <footer>
        Every official forecast is SHA-256 hashed at creation and anchored to a public git
        repository before kickoff. No forecast is ever revised or back-filled.
      </footer>
    </div>
  );
}
