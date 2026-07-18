// Match detail: header, probability bar(s), forecast-revision timeline, grade, and the
// verification showcase. Deep-linkable — /match/:id is the shareable artifact.
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { ProbBar } from "../../components/ui/ProbBar";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { kickoffLocal, kickoffUTC, nats, teamName, voidPhrase } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { VerificationPanel } from "./VerificationPanel";

const RESULT_LABEL = { H: "home win", D: "draw", A: "away win" } as const;

export function MatchPage() {
  const { id } = useParams();
  const matchId = Number(id);
  const detail = useApi(() => api.matchDetail(matchId), [matchId]);
  const verify = useApi(() => api.verification(matchId), [matchId]);

  if (detail.loading)
    return (
      <div className="page">
        <Skeleton height={220} />
      </div>
    );
  if (detail.notFound)
    return (
      <div className="page">
        <EmptyState title="Match not found">
          <Link to="/forecasts">Back to forecasts</Link>
        </EmptyState>
      </div>
    );
  if (detail.error || !detail.data)
    return (
      <div className="page">
        <ErrorState retry={detail.retry} />
      </div>
    );

  const m = detail.data;
  const current = m.forecasts.filter((f) => !f.voided).at(-1);

  return (
    <div className="page">
      <Section
        lead
        eyebrow={`match #${m.match_id} · season ${m.season}${m.neutral_site ? " · neutral site" : ""}`}
        title={`${teamName(m.home)} vs ${teamName(m.away)}`}
        description={
          <>
            <time dateTime={m.kickoff_utc ?? undefined} title={kickoffUTC(m.kickoff_utc)}>
              {kickoffLocal(m.kickoff_utc)}
            </time>{" "}
            <span className="chip">{m.status}</span>
            {m.score && (
              <>
                {" "}
                <strong className="mono">
                  {m.score} ({m.result ? RESULT_LABEL[m.result] : ""})
                </strong>
              </>
            )}
          </>
        }
      >
        {current ? (
          <div className="card fixture-card stamped">
            <div className="meta">
              <Badge kind="frozen" />
              <span className="chip">rev {current.fixture_revision}</span>
              <span className="chip">{current.model_label}</span>
              {current.stale_inputs && <Badge kind="draft" label="issued under STALE inputs" />}
            </div>
            <ProbBar pHome={current.p_home} pDraw={current.p_draw} pAway={current.p_away} />
            {current.grade && (
              <div className="meta">
                <span className="chip">log loss {nats(current.grade.log_loss)}</span>
                <span className="chip">rps {nats(current.grade.rps)}</span>
                <span className="chip">brier {nats(current.grade.brier)}</span>
                <Badge
                  kind={current.grade.correct ? "ok" : "none"}
                  label={current.grade.correct ? "✓ top pick hit" : "top pick missed"}
                />
              </div>
            )}
          </div>
        ) : m.draft ? (
          <div className="card fixture-card pencilled">
            <div className="meta" style={{ border: "none", padding: 0, margin: 0 }}>
              <Badge
                kind="draft"
                title="Preliminary — refreshes until kickoff−3h, then the official forecast freezes"
              />
              {m.kickoff_utc &&
                (new Date(m.kickoff_utc).getTime() - 3 * 3600 * 1000 > Date.now() ? (
                  <span className="chip" title="When the official forecast freezes">
                    freezes{" "}
                    {kickoffLocal(
                      new Date(
                        new Date(m.kickoff_utc).getTime() - 3 * 3600 * 1000,
                      ).toISOString(),
                    )}
                  </span>
                ) : (
                  <span className="chip" title="Cutoff passed — the official freezes at the next hourly run">
                    freezing at the next run
                  </span>
                ))}
            </div>
            <ProbBar pHome={m.draft.p_home} pDraw={m.draft.p_draw} pAway={m.draft.p_away} />
            <p className="blurb">
              Preliminary draft — the official forecast freezes at kickoff−3h, is hashed, and
              is anchored publicly. <Link to="/methodology">How verification works →</Link>
            </p>
          </div>
        ) : (
          <EmptyState title="No forecast yet">
            Drafts generate inside the 7-day window; the official forecast freezes at
            kickoff−3h. <Link to="/forecasts">See upcoming fixtures →</Link>
          </EmptyState>
        )}
      </Section>

      {m.forecasts.length > 0 && (
        <Section
          eyebrow="History"
          title="Forecast timeline"
          description="Every official version ever issued for this fixture — voided versions
          are kept forever, never deleted."
        >
          <div className="timeline">
            {m.forecasts.map((f) => {
              const vp = voidPhrase(f.void_reason);
              return (
                <div key={f.prediction_id} className={`tl-item ${f.voided ? "voided" : ""}`}>
                  <span className="tl-time">
                    frozen {f.created_utc ?? "—"} · cutoff {f.cutoff_utc ?? "—"} · rev{" "}
                    {f.fixture_revision}
                  </span>
                  <span className="mono" style={{ fontSize: "var(--text-sm)" }}>
                    H {(f.p_home * 100).toFixed(1)}% · D {(f.p_draw * 100).toFixed(1)}% · A{" "}
                    {(f.p_away * 100).toFixed(1)}%{" "}
                    {f.voided && (
                      <Badge kind="voided" label={vp ? `voided · ${vp}` : "voided"} />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {m.events.length > 0 && (
            <details>
              <summary className="chip" style={{ cursor: "pointer" }}>
                full event log ({m.events.length})
              </summary>
              <div className="timeline" style={{ marginTop: "var(--space-3)" }}>
                {m.events.map((e, i) => (
                  <div key={i} className={`tl-item ${e.type === "Voided" ? "voided" : ""}`}>
                    <span className="tl-time">{e.at ?? ""}</span>
                    <span>
                      {e.type}
                      {e.details ? ` — ${JSON.stringify(e.details)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Section>
      )}

      <Section
        eyebrow="Proof"
        meta={["SHA-256", "anchored before kickoff"]}
        title="Verify this forecast"
        description={
          current
            ? "Recompute the hash — right here in your browser, or offline — find the anchor line in the public repository, and check it entered public history before kickoff. No trust required."
            : "Once the official forecast freezes at kickoff−3h, its SHA-256 appears here — recompute it in your browser, find the anchor line in the public repository, and check it entered public history before kickoff."
        }
      >
        {verify.loading && <Skeleton height={160} />}
        {(verify.error || verify.notFound) && (
          <p className="blurb">Verification payload unavailable right now.</p>
        )}
        {verify.data && <VerificationPanel v={verify.data} />}
      </Section>
    </div>
  );
}
