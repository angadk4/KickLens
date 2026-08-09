// Match detail: header, probability bar(s), forecast-revision timeline, grade, and the
// verification showcase. Deep-linkable — /match/:id is the shareable artifact.
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { CardDetail } from "../../components/ui/CardDetail";
import { ProbBar } from "../../components/ui/ProbBar";
import { Reveal } from "../../components/ui/Reveal";
import { Section } from "../../components/ui/Section";
import { Verdict } from "../../components/ui/Verdict";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { kickoffLocal, kickoffUTC, nats, teamName, voidPhrase } from "../../lib/format";
import { matchPhase, phaseLabel } from "../../lib/matchPhase";
import { useApi } from "../../lib/useApi";
import { relTime, useNow } from "../../lib/useRelativeTime";
import { verdictOf } from "../../lib/verdict";
import { VerificationPanel } from "./VerificationPanel";

const RESULT_LABEL = { H: "home win", D: "draw", A: "away win" } as const;

export function MatchPage() {
  const { id } = useParams();
  const matchId = Number(id);
  const detail = useApi(() => api.matchDetail(matchId), [matchId]);
  const verify = useApi(() => api.verification(matchId), [matchId]);
  const now = useNow(); // phase chip ages honestly while the tab stays open

  if (detail.loading && !detail.retrying)
    return (
      <div className="page">
        <Skeleton height={220} ball label="loading match details…" />
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
  if (detail.error || detail.retrying || !detail.data)
    return (
      <div className="page">
        <ErrorState retry={detail.retry} retrying={detail.retrying} what="match details" />
      </div>
    );

  const m = detail.data;
  const current = m.forecasts.filter((f) => !f.voided).at(-1);
  // display phase, NOT the raw DB status: between kickoff and the results sync the DB
  // still says 'scheduled' for a game that may have finished — the phase model infers
  // honestly from the clock instead of asserting a stale state. A resulted match with NO
  // gradeable forecast (historical rows; a voided-only fixture) must read plain "full
  // time" — "awaiting grade" would promise a grade that will never come.
  const chip =
    m.result != null && !current
      ? { text: "full time", title: undefined }
      : phaseLabel(
          matchPhase({
            kickoff_utc: m.kickoff_utc,
            status: m.status,
            result: m.result,
            graded: !!current?.grade,
            frozen: !!current,
            now,
          }),
        );

  return (
    <div className="page">
      <Section
        lead
        id="match" /* stable anchor: the eyebrow is dynamic, slugify would drift per match */
        eyebrow={`match #${m.match_id} · season ${m.season}${m.neutral_site ? " · neutral site" : ""}`}
        title={`${teamName(m.home)} vs ${teamName(m.away)}`}
        description={
          <>
            <time dateTime={m.kickoff_utc ?? undefined} title={kickoffUTC(m.kickoff_utc)}>
              {kickoffLocal(m.kickoff_utc)}
            </time>{" "}
            <span className="chip" title={chip.title}>
              {chip.text}
            </span>
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
          <div
            className={`card fixture-card stamped${
              current.grade ? ` ${verdictOf(current.grade.correct).edgeClass}` : ""
            }`}
          >
            <div className="meta">
              <Badge kind="frozen" />
              <span className="chip">rev {current.fixture_revision}</span>
              <span className="chip">{current.model_label}</span>
              {current.stale_inputs && <Badge kind="draft" label="issued under STALE inputs" />}
              {/* this card has no .teams row (the matchup is the page h1), so the stamp
                  rides the identity row instead — pushed to the far right by .pick-slot,
                  the same right-edge scan position it holds on the record grid */}
              {current.grade && (
                <span className="pick-slot">
                  <Verdict correct={current.grade.correct} />
                </span>
              )}
            </div>
            {/* once graded, the bar carries the outcome rule: a mark the width of the segment
                that happened. The number it prints is that segment's own frozen probability —
                the value inside the hash — while the log loss chip below is the graded figure.
                They are the same claim (log_loss = −ln p, unit-tested), stated in both units. */}
            <ProbBar
              pHome={current.p_home}
              pDraw={current.p_draw}
              pAway={current.p_away}
              result={current.grade ? (m.result ?? undefined) : undefined}
            />
            {current.grade && (
              <div className="meta">
                <span className="chip">log loss {nats(current.grade.log_loss)}</span>
                <span className="chip">rps {nats(current.grade.rps)}</span>
                <span className="chip">brier {nats(current.grade.brier)}</span>
                {/* the verdict moved up to the identity row (and onto the card's right edge)
                    so it is findable at a glance; this row stays purely quantitative */}
              </div>
            )}
            {/* provenance the card always carried but never showed — the full chain of
                custody: inputs locked (cutoff) → written (frozen) → published (anchored).
                A null anchored_at prints nothing: no claim without its timestamp. */}
            <CardDetail>
              {current.created_utc && <>frozen {kickoffUTC(current.created_utc)} · </>}
              {current.cutoff_utc && <>cutoff {kickoffUTC(current.cutoff_utc)} · </>}
              {current.anchored_at_utc && <>anchored {kickoffUTC(current.anchored_at_utc)} · </>}
              id #{current.prediction_id}
            </CardDetail>
          </div>
        ) : m.draft ? (
          <div className="card fixture-card pencilled">
            <div className="meta" style={{ border: "none", padding: 0, margin: 0 }}>
              <Badge
                kind="draft"
                title="Preliminary: refreshes until kickoff−3h, then the official forecast freezes"
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
                  <span className="chip" title="Cutoff passed. The official freezes at the next hourly run">
                    freezing at the next run
                  </span>
                ))}
              {/* drafts age: WHEN this preliminary was generated is part of reading it */}
              {m.draft.generated_utc && (
                <span className="chip" title={kickoffUTC(m.draft.generated_utc)}>
                  drafted {relTime(m.draft.generated_utc, now)}
                </span>
              )}
            </div>
            <ProbBar pHome={m.draft.p_home} pDraw={m.draft.p_draw} pAway={m.draft.p_away} />
            <p className="blurb">
              This is a preliminary draft. The official forecast freezes at kickoff−3h, is
              hashed, and is anchored publicly. <Link to="/methodology">How verification works →</Link>
            </p>
          </div>
        ) : (
          <EmptyState title="No forecast yet">
            Drafts generate inside the 7-day draft window; the official forecast freezes at
            kickoff−3h. <Link to="/forecasts">See upcoming fixtures →</Link>
          </EmptyState>
        )}
      </Section>

      {m.forecasts.length > 0 && (
        <Section
          eyebrow="History"
          title="Forecast timeline"
          description="Every official version ever issued for this fixture. Voided versions
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
                      {e.details ? `: ${JSON.stringify(e.details)}` : ""}
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
            ? "Recompute the hash yourself, right here in your browser or offline. Find the anchor line in the public repository, and check it entered public history before kickoff. No trust required."
            : "Once the official forecast freezes at kickoff−3h, its SHA-256 appears here. Recompute it in your browser, find the anchor line in the public repository, and check it entered public history before kickoff."
        }
      >
        {verify.loading && <Skeleton height={160} />}
        {(verify.error || verify.notFound) && (
          <p className="blurb">Verification payload unavailable right now.</p>
        )}
        {verify.data && (
          <Reveal>
            <VerificationPanel v={verify.data} />
          </Reveal>
        )}
      </Section>
    </div>
  );
}
