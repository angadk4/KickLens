// One upcoming fixture: matchup, kickoff, FROZEN/PRELIMINARY badge, ProbBar, hash, cutoff.
import { Link } from "react-router-dom";
import type { UpcomingMatch } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { HashBadge } from "../../components/ui/HashBadge";
import { ProbBar } from "../../components/ui/ProbBar";
import { cutoffOf, kickoffLocal } from "../../lib/format";

export function FixtureCard({ m, legend = false }: { m: UpcomingMatch; legend?: boolean }) {
  const f = m.forecast;
  const cutoff = cutoffOf(m.kickoff_utc);
  const cutoffPassed = cutoff.getTime() <= Date.now();
  return (
    <Link to={`/match/${m.match_id}`} className="card fixture-card">
      <div className="teams">
        <span className="matchup">
          {m.home} <span style={{ color: "var(--ink-faint)" }}>vs</span> {m.away}
        </span>
        <span className="when">{kickoffLocal(m.kickoff_utc)}</span>
      </div>
      {f ? (
        <>
          <ProbBar pHome={f.p_home} pDraw={f.p_draw} pAway={f.p_away} legend={legend} />
          <div className="meta">
            {f.type === "official-frozen" ? (
              <Badge kind="frozen" />
            ) : (
              <Badge kind="draft" label="◌ PRELIMINARY — may change until kickoff−3h" />
            )}
            {!cutoffPassed && (
              <span className="chip">freezes {kickoffLocal(cutoff.toISOString())}</span>
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
