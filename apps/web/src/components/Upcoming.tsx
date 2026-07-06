import { useEffect, useState } from "react";
import { api, type UpcomingMatch } from "../api";
import { ProbBar } from "./ProbBar";

export function Upcoming() {
  const [matches, setMatches] = useState<UpcomingMatch[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.upcoming().then(setMatches).catch(() => setError(true));
  }, []);

  if (error) return <p className="muted">Could not load upcoming fixtures.</p>;
  if (matches === null) return <p className="muted">Loading…</p>;
  if (matches.length === 0)
    return <p className="muted">No upcoming fixtures with forecasts yet.</p>;

  return (
    <div className="cards">
      {matches.map((m) => (
        <div key={m.match_id} className="card">
          <div className="matchup">
            <strong>{m.home}</strong> vs <strong>{m.away}</strong>
          </div>
          <div className="kickoff">{new Date(m.kickoff_utc).toLocaleString()} (local)</div>
          {m.forecast ? (
            <>
              <span
                className={
                  m.forecast.type === "official-frozen" ? "tag official" : "tag draft"
                }
              >
                {m.forecast.type === "official-frozen"
                  ? "OFFICIAL — frozen"
                  : "PRELIMINARY — may change until kickoff−3h"}
              </span>
              <ProbBar
                pHome={m.forecast.p_home}
                pDraw={m.forecast.p_draw}
                pAway={m.forecast.p_away}
              />
              {m.forecast.forecast_hash && (
                <div className="hash" title="SHA-256, anchored publicly at creation">
                  ⬡ {m.forecast.forecast_hash.slice(0, 16)}…
                </div>
              )}
            </>
          ) : (
            <span className="tag none">no forecast yet</span>
          )}
        </div>
      ))}
    </div>
  );
}
