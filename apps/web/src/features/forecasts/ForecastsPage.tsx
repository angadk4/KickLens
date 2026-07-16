// Forecasts grouped by kickoff day — a schedule, not a card dump. One color key at the top;
// cards carry time-only since the day heading owns the date.
import { api, type UpcomingMatch } from "../../api";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { dayHeading } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { FixtureCard } from "./FixtureCard";

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
  const { data, error, loading, retry } = useApi(() => api.upcoming());
  return (
    <div className="page">
      <Section
        eyebrow="Upcoming"
        title="Forecasts"
        description="Preliminary probabilities refresh until kickoff−3h; at the cutoff the
        official forecast freezes, is SHA-256 hashed, and is anchored publicly. After that it
        can never change."
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
        {loading && (
          <div className="grid-2">
            <Skeleton height={150} />
            <Skeleton height={150} />
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        )}
        {error && <ErrorState retry={retry} />}
        {data && data.length === 0 && (
          <EmptyState title="No upcoming fixtures with forecasts yet">
            Fixtures appear here as the schedule fills; drafts generate inside the 7-day
            window.
          </EmptyState>
        )}
        {data &&
          data.length > 0 &&
          groupByDay(data).map((g) => (
            <div key={g.day} style={{ display: "grid", gap: "var(--space-3)" }}>
              <span className="eyebrow">{g.day}</span>
              <div className="grid-2">
                {g.items.map((m) => (
                  <FixtureCard key={m.match_id} m={m} timeOnly />
                ))}
              </div>
            </div>
          ))}
      </Section>
    </div>
  );
}
