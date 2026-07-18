// Frozen official forecasts whose match has kicked off but isn't graded yet — the window
// where a forecast has left "upcoming" but hasn't entered the graded record. Renders NOTHING
// off-matchday (no in-play games), so it never disturbs the normal page; on a matchday it keeps
// these sealed forecasts visible with a link to each match's proof, so nothing ever vanishes
// between kickoff and grading. T-171: pure live read, frozen probabilities only — no metrics.
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { HashBadge } from "../../components/ui/HashBadge";
import { ProbBar } from "../../components/ui/ProbBar";
import { Section } from "../../components/ui/Section";
import { dateShort, teamName } from "../../lib/format";
import { useApi } from "../../lib/useApi";

export function InPlaySection() {
  const { data } = useApi(() => api.inPlay());
  if (!data || data.length === 0) return null;
  return (
    <Section
      eyebrow="In play"
      meta={[`${data.length} awaiting result`]}
      title="In play · awaiting result"
      description="Frozen before kickoff and now underway — no longer upcoming, not yet graded.
      They stay visible here until the result is in and each forecast is graded into the record."
    >
      <div className="grid-2 grid-3-wide">
        {data.map((m) => (
          <Link
            key={m.match_id}
            to={`/match/${m.match_id}`}
            className="card fixture-card stamped"
          >
            <div className="teams">
              <span className="matchup">
                {teamName(m.home)} <span className="vs">vs</span> {teamName(m.away)}
              </span>
              <span className="when">{dateShort(m.kickoff_utc)}</span>
            </div>
            <ProbBar
              pHome={m.forecast.p_home}
              pDraw={m.forecast.p_draw}
              pAway={m.forecast.p_away}
            />
            <div className="meta">
              <Badge kind="frozen" title="Official — immutable, hashed, publicly anchored" />
              <span className="chip">
                {m.status === "final"
                  ? "full time · awaiting grade"
                  : "in play · awaiting result"}
              </span>
              {m.forecast.forecast_hash && <HashBadge hash={m.forecast.forecast_hash} />}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
