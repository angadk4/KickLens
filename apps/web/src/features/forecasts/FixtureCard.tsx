// One upcoming fixture: matchup (fixed 2-line slot so bars align across a row), kickoff,
// ProbBar, then a divided footer: state badge · freeze/kickoff cue · hash. Short labels only.
// A sealed card within 2h of kickoff carries a "kicks off in…" cue so it can't be mistaken
// for a game already underway (the FROZEN badge describes the forecast, not the match).
import { memo } from "react";
import { Link } from "react-router-dom";
import type { UpcomingMatch } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { CardDetail } from "../../components/ui/CardDetail";
import { HashBadge } from "../../components/ui/HashBadge";
import { ProbBar } from "../../components/ui/ProbBar";
import { ANCHORS_URL } from "../../lib/facts";
import { cutoffOf, kickoffLocal, teamName, timeLocal } from "../../lib/format";
import { IMMINENT_KICKOFF_MIN } from "../../lib/matchPhase";
import { useNow } from "../../lib/useRelativeTime";
import { useTilt } from "../../lib/useTilt";

function inWords(mins: number): string {
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function FixtureCardImpl({
  m,
  timeOnly = false,
  tilt = false,
}: {
  m: UpcomingMatch;
  timeOnly?: boolean;
  /** pointer tilt — licensed to the FOUR home board cards only (docs/motion.md) */
  tilt?: boolean;
}) {
  const now = useNow(30_000); // the imminence cue counts down without a refetch
  const tiltHandlers = useTilt<HTMLAnchorElement>();
  const f = m.forecast;
  const cutoff = cutoffOf(m.kickoff_utc);
  const cutoffPassed = cutoff.getTime() <= now;
  const minsToKickoff = Math.floor((new Date(m.kickoff_utc).getTime() - now) / 60_000);
  const state = f?.type === "official-frozen" ? "stamped" : f ? "pencilled" : "";
  return (
    <Link
      to={`/match/${m.match_id}`}
      className={`card fixture-card ${state}${tilt ? " card-tilt" : ""}`}
      {...(tilt ? tiltHandlers : {})}
    >
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
              <Badge kind="frozen" title="Official: immutable, hashed, publicly anchored" />
            ) : (
              <Badge
                kind="draft"
                title="Preliminary: refreshes until kickoff−3h, then the official forecast freezes"
              />
            )}
            {f.type === "official-frozen" &&
              minsToKickoff > 0 &&
              minsToKickoff <= IMMINENT_KICKOFF_MIN && (
                <span
                  className="chip"
                  title="Forecast sealed at kickoff−3h; the match starts soon"
                >
                  kicks off in {inWords(minsToKickoff)}
                </span>
              )}
            {/* the hint chips carry no tabIndex: a focusable span nested inside the card
                Link would be a nested-interactive violation — title covers AT */}
            {f.type !== "official-frozen" &&
              (!cutoffPassed ? (
                <span
                  className="chip hint"
                  title="When the official forecast freezes"
                  data-hint="When the official forecast freezes: sealed at kickoff−3h, hashed, and anchored publicly."
                >
                  {/* drop the day ONLY when the freeze shares the kickoff's UTC day —
                      the day headings group by UTC, so the check must agree with them
                      (parse → toISOString: never assume the API string's offset form).
                      This rule is PAGE-INDEPENDENT on purpose: keyed off `timeOnly` it made
                      the same fixture print a short chip on /forecasts and a long one on
                      /home, so one page laid the footer out inline and the other stacked it.
                      The kickoff line directly above always carries the date, so the short
                      form loses nothing wherever the card is rendered. */}
                  freezes{" "}
                  {cutoff.toISOString().slice(0, 10) ===
                  new Date(m.kickoff_utc).toISOString().slice(0, 10)
                    ? timeLocal(cutoff.toISOString())
                    : kickoffLocal(cutoff.toISOString())}
                </span>
              ) : (
                <span
                  className="chip hint"
                  title="Inputs locked; the official forecast anchors at the next hourly run"
                  data-hint="Inputs locked at kickoff−3h; the official forecast anchors at the next hourly run."
                >
                  freeze pending
                </span>
              ))}
            {/* the TREE link, deliberately — the exact file+line is only knowable from the
                server (anchor day = freeze day, not kickoff day; lib/facts.ts) */}
            {f.forecast_hash && <HashBadge hash={f.forecast_hash} href={ANCHORS_URL} />}
          </div>
          {/* the held-back line: numbers this card already computed and used to discard.
              Inside the imminent window the chip above owns the countdown — no duplicate. */}
          {f.type === "official-frozen" && (
            <CardDetail>
              sealed {timeLocal(cutoff.toISOString())}
              {minsToKickoff > IMMINENT_KICKOFF_MIN && (
                <> · kicks off in {inWords(minsToKickoff)}</>
              )}
            </CardDetail>
          )}
        </>
      ) : (
        <div className="meta">
          <Badge kind="none" />
        </div>
      )}
    </Link>
  );
}

// memo: `m` keeps its identity across notYetKickedOff's filter, so this holds. /forecasts
// re-renders on its own 60s clock and there are ~30 cards; without this, one tick
// re-rendered every card, its ProbBar, its badges and its hash chip.
export const FixtureCard = memo(FixtureCardImpl);
