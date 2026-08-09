// Forecasts grouped by kickoff day — a schedule, not a card dump. One color key at the top;
// cards carry time-only since the day heading owns the date.
import { api, type UpcomingMatch } from "../../api";
import { useHealth } from "../../components/layout/HealthContext";
import { Entry } from "../../components/ui/Entry";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { dayHeading } from "../../lib/format";
import { notYetKickedOff } from "../../lib/matchPhase";
import { useApi } from "../../lib/useApi";
import { useNow } from "../../lib/useRelativeTime";
import { FixtureCard } from "./FixtureCard";
import { InPlaySection } from "./InPlaySection";

function groupByDay(list: UpcomingMatch[]): { day: string; items: UpcomingMatch[] }[] {
  const groups = new Map<string, UpcomingMatch[]>();
  for (const m of list) {
    const key = dayHeading(m.kickoff_utc);
    const g = groups.get(key);
    if (g) g.push(m);
    else groups.set(key, [m]);
  }
  return Array.from(groups, ([day, items]) => ({ day, items }));
}

export function ForecastsPage() {
  // this page keeps its own fetch for the error/retry surface, but shares the ONE
  // definition of "upcoming" with the board, the ticker and the status cell
  const { data, error, loading, retrying, retry } = useApi(() => api.upcoming());
  const { health } = useHealth();
  const now = useNow();
  const upcoming = data ? notYetKickedOff(data, now) : null;
  return (
    <div className="page">
      <Section
        lead
        eyebrow="Upcoming"
        meta={["freeze = kickoff−3h"]}
        title="Forecasts"
        description="Preliminary probabilities refresh until kickoff−3h; at the cutoff the
        official forecast freezes, is SHA-256 hashed, and is anchored publicly. After that it
        can never change. Days group by UTC, the record's clock; card times are local."
      >
        <div className="probbar-legend" aria-hidden>
          <span>
            <span className="swatch" style={{ background: "var(--home)" }} />H home
          </span>
          <span>
            <span className="swatch" style={{ background: "var(--draw)" }} />D draw
          </span>
          <span>
            <span className="swatch" style={{ background: "var(--away)" }} />A away
          </span>
        </div>
        <span className="eyebrow">
          preliminary = may change until the freeze · frozen = sealed official forecast, never
          revised
        </span>
        {loading && !retrying && (
          <div className="grid-2">
            <Skeleton height={150} />
            <Skeleton height={150} />
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        )}
        {(error || retrying) && (
          <ErrorState retry={retry} retrying={retrying} what="upcoming fixtures" />
        )}
        {upcoming && upcoming.length === 0 && (
          <EmptyState title="No upcoming fixtures with forecasts yet">
            {health?.schedule_fresh === false
              ? `Our fixture feed is stale. The last full schedule sync finished ${health.last_full_ingest ?? "never"}, so fixtures are missing here rather than absent from the league. Results and grading are unaffected.`
              : "Fixtures appear here as the 7-day schedule sweep picks them up; drafts generate inside the same 7-day window."}
          </EmptyState>
        )}
      </Section>
      {/* forecasts already underway — chronologically between "now" and the upcoming days */}
      <InPlaySection />
      {/* each day is a strap: the date breaks the rule, the count sits on it */}
      {upcoming &&
        upcoming.length > 0 &&
        groupByDay(upcoming).map((g) => (
          <Entry key={g.day}>
            <header className="entry-strap">
              <span className="strap-label">{g.day}</span>
              <span className="strap-rule" aria-hidden />
              <span className="strap-meta">
                <span>
                  {g.items.length} fixture{g.items.length === 1 ? "" : "s"}
                </span>
              </span>
            </header>
            <div className="entry-body">
              {/* the one licensed stagger surface: cards land 60ms apart on scroll-in */}
              <div className="grid-2 grid-3-wide settle-stagger">
                {g.items.map((m) => (
                  <FixtureCard key={m.match_id} m={m} timeOnly />
                ))}
              </div>
            </div>
          </Entry>
        ))}
    </div>
  );
}
