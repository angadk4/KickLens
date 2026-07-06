import { useEffect, useState } from "react";
import { api, type CompletedItem } from "../api";
import { ProbBar } from "./ProbBar";

const RESULT_LABEL = { H: "home win", D: "draw", A: "away win" } as const;

export function Archive() {
  const [data, setData] = useState<{ total_graded: number; items: CompletedItem[] } | null>(
    null,
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    api.completed().then(setData).catch(() => setError(true));
  }, []);

  if (error) return <p className="muted">Could not load the archive.</p>;
  if (data === null) return <p className="muted">Loading…</p>;
  if (data.items.length === 0)
    return (
      <p className="muted">
        The live record is empty — it begins with the first official forecast at MLS
        resumption. Nothing here is back-filled, ever.
      </p>
    );

  return (
    <>
      <p className="muted">{data.total_graded} graded official forecasts (live record).</p>
      <div className="cards">
        {data.items.map((it) => (
          <div key={`${it.match_id}-${it.forecast_hash}`} className="card">
            <div className="matchup">
              <strong>{it.home}</strong> vs <strong>{it.away}</strong>
            </div>
            <div className="kickoff">{new Date(it.kickoff_utc).toLocaleDateString()}</div>
            <ProbBar pHome={it.p_home} pDraw={it.p_draw} pAway={it.p_away} />
            <div>
              result: <strong>{RESULT_LABEL[it.result]}</strong> · log loss{" "}
              {it.log_loss.toFixed(3)} · {it.correct ? "top pick hit" : "top pick missed"}
            </div>
            <div className="hash">⬡ {it.forecast_hash.slice(0, 16)}…</div>
          </div>
        ))}
      </div>
    </>
  );
}
