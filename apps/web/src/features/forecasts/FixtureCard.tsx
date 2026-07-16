// One upcoming fixture: matchup (fixed 2-line slot so bars align across a row), kickoff,
// ProbBar, then a divided footer: state badge · freeze time · hash. Short labels only.
import { Link } from "react-router-dom";
import type { UpcomingMatch } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { HashBadge } from "../../components/ui/HashBadge";
import { ProbBar } from "../../components/ui/ProbBar";
import { cutoffOf, kickoffLocal, timeLocal } from "../../lib/format";

export function FixtureCard({ m, timeOnly = false }: { m: UpcomingMatch; timeOnly?: boolean }) {
  const f = m.forecast;
  const cutoff = cutoffOf(m.kickoff_utc);
  const cutoffPassed = cutoff.getTime() <= Date.now();
  const state =
    f?.type === "official-frozen" ? "stamped" : f ? "pencilled" : "";
  return (
    <Link to={`/match/${m.match_id}`} className={`card fixture-card ${state}`}>
      <div className="teams">
        <span className="matchup">
          {m.home} <span className="vs">vs</span> {m.away}
        </span>
        <span className="when">
          {timeOnly ? timeLocal(m.kickoff_utc) : kickoffLocal(m.kickoff_utc)}
        </span>
      </div>
      {f ? (
        <>
          <ProbBar pHome={f.p_home} pDraw={f.p_draw} pAway={f.p_away} />
          <div className="meta">
            {f.type === "official-frozen" ? (
              <Badge kind="frozen" title="Official — immutable, hashed, publicly anchored" />
            ) : (
              <Badge
                kind="draft"
                title="Preliminary — refreshes until kickoff−3h, then the official forecast freezes"
              />
            )}
            {!cutoffPassed && (
              <span className="chip" title="When the official forecast freezes">
                {/* drop the day ONLY when the freeze shares the kickoff's local day —
                    late kickoffs freeze the previous evening */}
                freezes{" "}
                {timeOnly &&
                cutoff.toDateString() === new Date(m.kickoff_utc).toDateString()
                  ? timeLocal(cutoff.toISOString())
                  : kickoffLocal(cutoff.toISOString())}
              </span>
            )}
            {f.forecast_hash && <HashBadge hash={f.forecast_hash} />}
          </div>
        </>
      ) : (
        <div className="meta">
          <Badge kind="none" />
        </div>
      )}
    </Link>
  );
}
