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
import { dateShort, nats } from "../../lib/format";
import { useApi } from "../../lib/useApi";

const RESULT_LABEL = { H: "home win", D: "draw", A: "away win" } as const;

export function RecordPage() {
  const { data, error, loading, retry } = useApi(() => api.completed());
  return (
    <div className="page">
      <Section
        eyebrow="Live record"
        title="Graded official forecasts"
        description="This page IS the track record — frozen before kickoff, graded after full
        time, never back-filled."
      >
        {loading && <Skeleton height={160} />}
        {error && <ErrorState retry={retry} />}
        {data && data.total_graded === 0 && (
          <EmptyState big="0" title="graded official forecasts">
            The first officials haven't kicked off yet — forecasts start freezing Jul 16, 2026
            (20:30 UTC) and grades follow the results.{" "}
            <Link to="/forecasts">See upcoming fixtures →</Link>
          </EmptyState>
        )}
        {data && data.total_graded > 0 && (
          <>
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
              <ScopeChip scope="live" n={data.total_graded} />
              <span className="chip">newest first</span>
            </div>
            <div className="grid-2">
              {data.items.map((it) => (
                <Link key={it.match_id} to={`/match/${it.match_id}`} className="card fixture-card">
                  <div className="teams">
                    <span className="matchup">
                      {it.home} <span style={{ color: "var(--ink-faint)" }}>vs</span> {it.away}
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
