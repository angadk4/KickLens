// The live record — graded official forecasts only. Its empty state is a designed feature:
// the record starts at zero and nothing is ever back-filled.
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { HashBadge } from "../../components/ui/HashBadge";
import { ProbBar } from "../../components/ui/ProbBar";
import { ScopeChip } from "../../components/ui/ScopeChip";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { cutoffOf, dateShort, kickoffLocal, nats, teamName } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { InPlaySection } from "../forecasts/InPlaySection";

/** the latest daily seal, pulled up from the footer to where verifiers look for it */
function SealChip() {
  const merkle = useApi(() => api.merkleRoots(1));
  const latest = merkle.data?.items?.[0];
  if (!latest) return null;
  return (
    <span
      className="chip"
      title={latest.committed_at_utc ?? undefined}
      style={{ color: "var(--gold)", borderColor: "color-mix(in srgb, var(--gold) 45%, transparent)" }}
    >
      latest seal {latest.day} ·{" "}
      {latest.anchor_file_html_url ? (
        <a href={latest.anchor_file_html_url} target="_blank" rel="noreferrer">
          merkle {latest.root.slice(0, 12)}… ↗
        </a>
      ) : (
        <>merkle {latest.root.slice(0, 12)}…</>
      )}
    </span>
  );
}

const RESULT_LABEL = { H: "home win", D: "draw", A: "away win" } as const;

export function RecordPage() {
  const { data, error, loading, retry } = useApi(() => api.completed());
  const upcoming = useApi(() => api.upcoming());
  // official forecasts already frozen but not yet graded — launch day reads "running"
  const frozenAwaiting =
    upcoming.data?.filter((m) => m.forecast?.type === "official-frozen").length ?? 0;
  // derived, never hardcoded: the next freeze instant from the schedule itself
  const nextCutoff = (upcoming.data ?? [])
    .map((m) => cutoffOf(m.kickoff_utc))
    .filter((c) => c.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return (
    <div className="page">
      {/* a live banner during matchdays: forecasts frozen and underway, about to join the
          record below. Renders nothing when no game is in play, so the record stays lead-first. */}
      <InPlaySection />
      <Section
        lead
        eyebrow="Live record"
        meta={["never back-filled"]}
        title="Graded official forecasts"
        description={
          <>
            This page <em>is</em> the track record — frozen before kickoff, graded after full
            time, never back-filled.
          </>
        }
      >
        {loading && <Skeleton height={160} />}
        {error && <ErrorState retry={retry} />}
        {data && data.total_graded === 0 && (
          <>
            {frozenAwaiting > 0 && (
              <span className="chip" style={{ justifySelf: "start" }}>
                {frozenAwaiting} official forecast{frozenAwaiting === 1 ? "" : "s"} frozen ·
                awaiting full time
              </span>
            )}
            <EmptyState big="0" title="graded official forecasts">
              No official forecast has been graded yet —{" "}
              {frozenAwaiting > 0
                ? "official forecasts are frozen; grades follow the first full-time results."
                : nextCutoff
                  ? `the first freeze lands ${kickoffLocal(nextCutoff.toISOString())}, and grades follow the results.`
                  : "grades follow the first full-time results."}{" "}
              <Link to="/forecasts">See upcoming fixtures →</Link>
            </EmptyState>
          </>
        )}
        {data && data.total_graded > 0 && (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-3)",
                alignItems: "center",
              }}
            >
              <ScopeChip scope="live" n={data.total_graded} />
              <span className="chip">newest first</span>
              <span className="chip" title="ln(3) — guessing ⅓/⅓/⅓ every match">
                1.0986 = knew-nothing baseline
              </span>
              <SealChip />
            </div>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              Small live samples are extremely noisy — judge this record in months, not
              matchdays.
            </p>
            <div className="grid-2">
              {data.items.map((it) => (
                <Link key={it.match_id} to={`/match/${it.match_id}`} className="card fixture-card stamped">
                  <div className="teams">
                    <span className="matchup">
                      {teamName(it.home)} <span style={{ color: "var(--ink-faint)" }}>vs</span>{" "}
                      {teamName(it.away)}
                    </span>
                    <span className="when">{dateShort(it.kickoff_utc)}</span>
                  </div>
                  <ProbBar pHome={it.p_home} pDraw={it.p_draw} pAway={it.p_away} />
                  <div className="meta">
                    <span className="chip">result: {RESULT_LABEL[it.result]}</span>
                    <span className="chip">log loss {nats(it.log_loss)}</span>
                    {typeof it.rps === "number" && (
                      <span className="chip">rps {nats(it.rps)}</span>
                    )}
                    <Badge
                      kind={it.correct ? "ok" : "none"}
                      label={it.correct ? "✓ top pick hit" : "top pick missed"}
                    />
                    <HashBadge hash={it.forecast_hash} />
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
