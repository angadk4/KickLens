// The health banners, extracted to a leaf so their 60s relative-time tick re-renders
// THIS component only — a useNow() in App would re-render every page, including the
// 50-card record grid. Also the fix for the raw ISO strings App used to print: the
// verifiable timestamp stays in title, the sentence reads like a sentence.
import { useHealth } from "./HealthContext";
import { useRelativeTime } from "../../lib/useRelativeTime";

export function HealthBanners() {
  const { health, apiDown } = useHealth();
  const ingested = useRelativeTime(health?.last_ingest);
  const fullSweep = useRelativeTime(health?.last_full_ingest);

  return (
    <>
      {apiDown && (
        <div className="banner error banner-in" role="status">
          API unreachable. Showing nothing rather than something stale without saying so.
        </div>
      )}
      {/* the general staleness notice steps aside when the schedule banner below owns
          the cause — otherwise a dead fixture sweep reads as "data is stale (last
          ingest 40 minutes ago)", which is its own small lie */}
      {health && !health.freshness_ok && health.schedule_fresh !== false && (
        <div className="banner stale banner-in" role="status">
          Data is stale. The last results ingest finished{" "}
          <span title={health.last_ingest ?? undefined}>
            {health.last_ingest ? ingested : "never"}
          </span>
          . Forecasts made under staleness are tagged.
        </div>
      )}
      {health && health.schedule_fresh === false && (
        <div className="banner stale banner-in" role="status">
          Fixture schedule not current. The last full fixture sweep finished{" "}
          <span title={health.last_full_ingest ?? undefined}>
            {health.last_full_ingest ? fullSweep : "never"}
          </span>
          , so upcoming fixtures may be incomplete or missing. Frozen forecasts, results,
          and grading are unaffected.
        </div>
      )}
    </>
  );
}
