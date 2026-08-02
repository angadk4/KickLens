// The last 48 hours, as records: prediction-ledger events (frozen, graded, voided,
// anchored) merged with ingest sweeps, from GET /activity. Renders NOTHING against an
// older API (404) or an empty window — a reference page never shows an error banner for
// an optional embellishment. Honest limitation, stated in the caption: record-affecting
// events and ingest sweeps only; feature/odds/canary runs leave no queryable trace on the
// read-only surface, and the feed does not pretend otherwise.
import { Link } from "react-router-dom";
import { api } from "../../api";
import { activityPhrase } from "../../lib/activity";
import { relTime, useNow } from "../../lib/useRelativeTime";
import { useApi } from "../../lib/useApi";

export function ActivityFeed() {
  const { data, error } = useApi(() => api.activity(48));
  const now = useNow();
  if (error || !data || data.items.length === 0) return null;
  return (
    <div className="activity-feed">
      <h3 className="af-title">
        activity · last {data.window_hours} h · from the ledger, not a log file
      </h3>
      <div className="timeline">
        {data.items.slice(0, 30).map((it, i) => {
          const p = activityPhrase(it);
          return (
            <div
              key={i}
              className={`tl-item${p.flag === "voided" ? " voided" : ""}${p.flag === "failed" ? " failed" : ""}`}
            >
              <span className="tl-time" title={it.at_utc ?? undefined}>
                {relTime(it.at_utc, now)}
              </span>
              <span>
                {p.action}
                {p.matchup && it.kind === "ledger" && (
                  <>
                    {" — "}
                    <Link to={`/match/${it.match_id}`}>{p.matchup}</Link>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
        Record-affecting events and ingest sweeps only — feature, odds and canary runs leave
        no queryable trace on the read-only API, so they are honestly absent here (their
        SCHEDULED runs are on the board above).
      </p>
    </div>
  );
}
