// The window between kickoff and the graded record: every official forecast whose match
// has kicked off but isn't graded yet. Each card carries its honest phase from matchPhase
// (in play / awaiting result / full time · awaiting grade) — derived from the clock as well
// as the DB, because the DB's status only refreshes at the results sync and would otherwise
// claim "in play" for games that ended hours ago. Renders NOTHING off-matchday; data comes
// from the shared UpcomingContext (one fetch + a slow matchday poll shared by every page).
import { Link } from "react-router-dom";
import { useUpcoming } from "../../components/layout/UpcomingContext";
import { Badge } from "../../components/ui/Badge";
import { HashBadge } from "../../components/ui/HashBadge";
import { ProbBar } from "../../components/ui/ProbBar";
import { Section } from "../../components/ui/Section";
import { kickoffUTC, teamName, timeLocal } from "../../lib/format";
import { matchPhase, phaseLabel } from "../../lib/matchPhase";
import { useNow } from "../../lib/useRelativeTime";

export function InPlaySection() {
  const { inPlay } = useUpcoming();
  const now = useNow(); // 60s tick: labels age past the full-time boundary with no refetch
  if (!inPlay || inPlay.length === 0) return null;

  const phased = inPlay.map((m) => ({
    m,
    phase: matchPhase({ kickoff_utc: m.kickoff_utc, status: m.status, frozen: true, now }),
  }));
  const nLive = phased.filter((p) => p.phase === "in-play").length;
  const nPending = phased.filter((p) => p.phase === "result-pending").length;
  const nGrading = phased.length - nLive - nPending; // result in, grade job pending
  const meta = [
    nLive > 0 ? `${nLive} in play` : null,
    nPending > 0 ? `${nPending} awaiting result` : null,
    nGrading > 0 ? `${nGrading} awaiting grade` : null,
  ].filter((x): x is string => x !== null);

  return (
    <Section
      eyebrow="Matchday"
      meta={meta}
      title="Between kickoff and the record"
      description="Frozen before kickoff, now being played — or finished and waiting for the
      final score to sync. Results post at the next results run; grading follows
      automatically. Nothing here can change."
    >
      <div className="grid-2 grid-3-wide">
        {phased.map(({ m, phase }) => {
          const label = phaseLabel(phase);
          return (
            <Link
              key={m.match_id}
              to={`/match/${m.match_id}`}
              className="card fixture-card stamped"
            >
              <div className="teams">
                <span className="matchup">
                  {teamName(m.home)} <span className="vs">vs</span> {teamName(m.away)}
                </span>
                <span className="when" title={kickoffUTC(m.kickoff_utc)}>
                  kicked off {timeLocal(m.kickoff_utc)}
                </span>
              </div>
              <ProbBar
                pHome={m.forecast.p_home}
                pDraw={m.forecast.p_draw}
                pAway={m.forecast.p_away}
              />
              <div className="meta">
                <Badge kind="frozen" title="Official — immutable, hashed, publicly anchored" />
                <span className="chip" title={label.title}>
                  {phase === "in-play" && <span className="pulse-dot" aria-hidden />}{" "}
                  {label.text}
                </span>
                {m.forecast.forecast_hash && <HashBadge hash={m.forecast.forecast_hash} />}
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
