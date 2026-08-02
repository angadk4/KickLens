// The last 48 hours, as records: prediction-ledger events (frozen, graded, voided,
// anchored) merged with ingest sweeps, from GET /activity. Renders NOTHING against an
// older API (404) or an empty window — a reference page never shows an error banner for
// an optional embellishment. Honest limitation, stated in the caption: record-affecting
// events and ingest sweeps only; feature/odds/canary runs leave no queryable trace on the
// read-only surface, and the feed does not pretend otherwise.
import { Link } from "react-router-dom";
import { api } from "../../api";
import { ACTIVITY_HOURS, activityPhrase } from "../../lib/activity";
import { relTime, useNow } from "../../lib/useRelativeTime";
import { useApi } from "../../lib/useApi";

/** Rows rendered. The endpoint returns up to 200; showing all of them would bury the page. */
const SHOWN = 30;

export function ActivityFeed() {
  const { data, error } = useApi(() => api.activity(ACTIVITY_HOURS));
  const now = useNow();
  if (error || !data || data.items.length === 0) return null;
  const total = data.items.length;
  const shown = Math.min(SHOWN, total);
  return (
    <div className="activity-feed">
      {/* the count is disclosed for the same reason /record prints "showing 30 of 106": a
          window label over a truncated list implies the list IS the window. Here it
          understates rather than overstates — 27 of the 48 hours read blank — but the rule
          is the rule. `total` is itself the endpoint's 200-row cap, so say so at the cap. */}
      <h3 className="af-title">
        activity · newest {shown} of {total}
        {total >= 200 ? "+" : ""} in the last {data.window_hours} h · from the ledger, not a
        log file
      </h3>
      <div className="timeline">
        {data.items.slice(0, SHOWN).map((it, i) => {
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
