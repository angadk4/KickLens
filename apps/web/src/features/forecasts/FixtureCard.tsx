// One upcoming fixture: matchup (fixed 2-line slot so bars align across a row), kickoff,
// ProbBar, then a divided footer: state badge · freeze/kickoff cue · hash. Short labels only.
// A sealed card within 2h of kickoff carries a "kicks off in…" cue so it can't be mistaken
// for a game already underway (the FROZEN badge describes the forecast, not the match).
import { Link } from "react-router-dom";
import type { UpcomingMatch } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { HashBadge } from "../../components/ui/HashBadge";
import { ProbBar } from "../../components/ui/ProbBar";
import { cutoffOf, kickoffLocal, teamName, timeLocal } from "../../lib/format";
import { IMMINENT_KICKOFF_MIN } from "../../lib/matchPhase";
import { useNow } from "../../lib/useRelativeTime";

export function FixtureCard({ m, timeOnly = false }: { m: UpcomingMatch; timeOnly?: boolean }) {
  const now = useNow(30_000); // the imminence cue counts down without a refetch
  const f = m.forecast;
  const cutoff = cutoffOf(m.kickoff_utc);
  const cutoffPassed = cutoff.getTime() <= now;
  const minsToKickoff = Math.floor((new Date(m.kickoff_utc).getTime() - now) / 60_000);
  const state = f?.type === "official-frozen" ? "stamped" : f ? "pencilled" : "";
  return (
    <Link to={`/match/${m.match_id}`} className={`card fixture-card ${state}`}>
      <div className="teams">
        <span className="matchup">
          {teamName(m.home)} <span className="vs">vs</span> {teamName(m.away)}
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
            {f.type === "official-frozen" &&
              minsToKickoff > 0 &&
              minsToKickoff <= IMMINENT_KICKOFF_MIN && (
                <span
                  className="chip"
                  title="Forecast sealed at kickoff−3h — the match starts soon"
                >
                  kicks off in{" "}
                  {minsToKickoff >= 60
                    ? `${Math.floor(minsToKickoff / 60)}h ${minsToKickoff % 60}m`
                    : `${minsToKickoff}m`}
                </span>
              )}
            {f.type !== "official-frozen" &&
              (!cutoffPassed ? (
                <span className="chip" title="When the official forecast freezes">
                  {/* drop the day ONLY when the freeze shares the kickoff's UTC day —
                      the day headings group by UTC, so the check must agree with them
                      (parse → toISOString: never assume the API string's offset form) */}
                  freezes{" "}
                  {timeOnly &&
                  cutoff.toISOString().slice(0, 10) ===
                    new Date(m.kickoff_utc).toISOString().slice(0, 10)
                    ? timeLocal(cutoff.toISOString())
                    : kickoffLocal(cutoff.toISOString())}
                </span>
              ) : (
                <span
                  className="chip"
                  title="Inputs locked; the official forecast anchors at the next hourly run"
                >
                  freeze pending
                </span>
              ))}
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
