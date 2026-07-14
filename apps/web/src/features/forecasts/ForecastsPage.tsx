import { api } from "../../api";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { useApi } from "../../lib/useApi";
import { FixtureCard } from "./FixtureCard";

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
        {loading && (
          <div className="grid-2">
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        )}
        {error && <ErrorState retry={retry} />}
        {data && data.length === 0 && (
          <EmptyState title="No upcoming fixtures with forecasts yet">
            Fixtures appear here as the schedule fills; drafts generate inside the 7-day
            window.
          </EmptyState>
        )}
        {data && data.length > 0 && (
          <div className="grid-2">
            {data.map((m, i) => (
              <FixtureCard key={m.match_id} m={m} legend={i === 0} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
