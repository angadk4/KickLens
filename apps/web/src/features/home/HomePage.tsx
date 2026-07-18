// Overview: the matchday board — hero + center-circle countdown over the halfway line,
// the freeze ticker, a KPI strip with a live status cell, next fixtures beside the
// pipeline rail. All liveness reads the ONE shared upcoming fetch (T-171 rules intact).
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useHealth } from "../../components/layout/HealthContext";
import { Ticker } from "../../components/layout/Ticker";
import { useUpcoming } from "../../components/layout/UpcomingContext";
import { Section } from "../../components/ui/Section";
import { StatTile } from "../../components/ui/StatTile";
import { Skeleton } from "../../components/ui/states";
import { freezeRunOf, kickoffLocal, kickoffUTC, nats, teamName, timeLocal } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useCountdown } from "../../lib/useCountdown";
import { useRelativeTime } from "../../lib/useRelativeTime";
import { FixtureCard } from "../forecasts/FixtureCard";
import { InPlaySection } from "../forecasts/InPlaySection";
import { PitchHero } from "./PitchHero";

function Hero() {
  const { nextCutoff, nextMatch } = useUpcoming();
  const cd = useCountdown(nextCutoff);

  return (
    <div className="entry hero-entry">
      <div className="entry-body">
        <div className="hero-stage">
          <div className="hero-copy">
            <p className="hero-kicker">MLS 2026 · read-only record · freeze = kickoff−3h</p>
            <h1>Every official forecast goes on the record. None come off.</h1>
            <p className="sub">
              Each one freezes 3 hours before kickoff, is SHA-256 hashed and anchored to a
              public GitHub repository, then graded automatically against the result — and
              the limitations are printed on the same pages as the results.
            </p>
            <div className="hero-ctas">
              <Link to="/forecasts" className="btn primary">
                See upcoming forecasts
              </Link>
              <Link to="/methodology">How verification works →</Link>
            </div>
          </div>

          <PitchHero
            expired={!!nextCutoff && cd.expired}
            top={
              nextCutoff ? (
                !cd.expired ? (
                  <>
                    <div className="fp-head">next official freeze in</div>
                    <div className="countdown" aria-live="off">
                      {(() => {
                        const units = [
                          { v: cd.d, l: "days" },
                          { v: cd.h, l: "hrs" },
                          { v: cd.m, l: "min" },
                          { v: cd.s, l: "sec" },
                        ];
                        let leading = true;
                        return units.map((u) => {
                          const zero = leading && u.v === 0;
                          if (u.v !== 0) leading = false;
                          const isSec = u.l === "sec";
                          return (
                            <span key={u.l} className={`unit ${zero ? "zero" : ""}`}>
                              <span
                                // re-keying the seconds span replays the roll — the heartbeat
                                key={isSec ? cd.s : undefined}
                                className={`value${isSec ? " roll" : ""}`}
                              >
                                {String(u.v).padStart(2, "0")}
                              </span>
                              <span className="label">{u.l}</span>
                            </span>
                          );
                        });
                      })()}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="fp-head">freeze pending</div>
                    {nextMatch && (
                      <div className="fc-match">
                        <span className="who">
                          {teamName(nextMatch.home)} <span className="vs">vs</span>{" "}
                          {teamName(nextMatch.away)}
                        </span>
                      </div>
                    )}
                    <p className="countdown-caption">
                      Inputs locked at kickoff−3h. The official forecast anchors at the next
                      hourly run
                      {nextCutoff
                        ? `, ≈ ${timeLocal(freezeRunOf(nextCutoff).toISOString())}`
                        : ""}
                      .
                    </p>
                  </>
                )
              ) : undefined
            }
            bottom={
              nextMatch && nextCutoff && !cd.expired ? (
                <div className="fc-match">
                  <span className="who">
                    {teamName(nextMatch.home)} <span className="vs">vs</span>{" "}
                    {teamName(nextMatch.away)}
                  </span>
                  <span className="when">
                    freezes{" "}
                    <time
                      dateTime={nextCutoff.toISOString()}
                      title={kickoffUTC(nextCutoff.toISOString())}
                    >
                      {kickoffLocal(nextCutoff.toISOString())}
                    </time>
                  </span>
                </div>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

/** The board's status cell — honest about state (live / stale / unreachable), and it
    never repeats the hero's next-freeze fact. */
function StatusCell() {
  const { health, apiDown } = useHealth();
  const { list } = useUpcoming();
  const ingested = useRelativeTime(health?.last_ingest);
  const graded = useRelativeTime(health?.last_grade);
  const state = apiDown
    ? { label: "api unreachable", cls: "bad" }
    : health && !health.freshness_ok
      ? { label: "system stale", cls: "stale" }
      : health
        ? { label: "system live", cls: "" }
        : { label: "…", cls: "stale" };
  return (
    <div className="status-cell">
      <span className="sc-head">
        <span className={`pulse-dot ${state.cls}`} aria-hidden /> {state.label}
      </span>
      <span className="sc-row" title={health?.last_ingest ?? undefined}>
        ingested <span className="v">{apiDown ? "—" : ingested}</span>
      </span>
      <span className="sc-row" title={health?.last_grade ?? undefined}>
        graded <span className="v">{health?.last_grade ? graded : "—"}</span>
      </span>
      <span className="sc-row">
        window <span className="v">{list ? `${list.length} fixtures` : "—"}</span>
      </span>
    </div>
  );
}

export function HomePage() {
  const { list } = useUpcoming();
  const test = useApi(() => api.performance("test"));
  const dev = useApi(() => api.performance("dev"));
  const live = useApi(() => api.performance("live"));

  const testM = test.data?.metrics;
  const devM = dev.data?.metrics;
  // live n is known when the snapshot loads OR when 404 says none exists yet (truthfully 0);
  // an unreachable API must NOT claim 0
  const liveN = live.data?.metrics?.n ?? (live.notFound ? 0 : null);

  return (
    <div className="page board">
      <Hero />
      <Ticker />

      {/* on a matchday, the games in play surface right under the ticker; silent otherwise */}
      <InPlaySection />

      <Section
        eyebrow="Evidence"
        meta={["4 scopes", "never merged"]}
        title="The numbers, with their receipts"
        description="Four separate evidence scopes — development, the sealed touch-once test,
        labelled backtests, and the live record. They are never merged, and every figure
        carries its sample size."
      >
        <div className="grid-kpi">
          {testM?.log_loss !== undefined ? (
            <StatTile
              label="Test log loss · 2025"
              value={testM.log_loss}
              format={nats}
              scope="test"
              n={testM.n ?? null}
              sub={
                testM.log_loss_ci95
                  ? `touch-once · CI [${nats(testM.log_loss_ci95[0])}, ${nats(testM.log_loss_ci95[1])}]`
                  : "touch-once"
              }
            />
          ) : (
            <Skeleton height={130} />
          )}
          {testM?.ece !== undefined ? (
            <StatTile
              label="Test calibration · ECE"
              value={testM.ece}
              format={(v) => v.toFixed(4)}
              scope="test"
              n={testM.n ?? null}
              sub="one sealed run · champion frozen before it"
            />
          ) : (
            <Skeleton height={130} />
          )}
          {devM?.log_loss !== undefined ? (
            <StatTile
              label="Dev log loss"
              value={devM.log_loss}
              format={nats}
              scope="dev"
              n={devM.n ?? null}
              sub="2018–2024 walk-forward, leak-tested"
            />
          ) : (
            <Skeleton height={130} />
          )}
          {liveN !== null ? (
            <StatTile
              label="Live graded forecasts"
              value={liveN}
              scope="live"
              n={liveN}
              sub="accrues in real time, never back-filled"
            />
          ) : (
            <Skeleton height={130} />
          )}
          <StatusCell />
        </div>
        <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
          Log loss — lower is better. Guessing ⅓/⅓/⅓ every match scores 1.0986; on the same
          sealed test the closing market scored 1.0317 — ahead of the model, and said so
          plainly. The full ladder is on <Link to="/performance">Performance</Link>.
        </p>
      </Section>

      <Section
        eyebrow="Next up"
        meta={["7-day window"]}
        title="Upcoming fixtures"
        description={
          <>
            Preliminary probabilities refresh until each fixture's cutoff; frozen official
            forecasts are sealed and never revised. <Link to="/forecasts">All forecasts →</Link>
          </>
        }
      >
        <div className="board-split">
          {list ? (
            <div className="grid-2">
              {list.slice(0, 4).map((m) => (
                <FixtureCard key={m.match_id} m={m} />
              ))}
            </div>
          ) : (
            <div className="grid-2">
              <Skeleton height={160} />
              <Skeleton height={160} />
              <Skeleton height={160} />
              <Skeleton height={160} />
            </div>
          )}

          <aside className="rail" aria-label="The pipeline">
            <span className="rail-title">the pipeline</span>
            <div className="rail-row">
              <span className="n">01</span>
              <div>
                <strong>Freeze · kickoff−3h</strong>
                <span>written once to the ledger; post-kickoff writes rejected</span>
              </div>
            </div>
            <div className="rail-row">
              <span className="n">02</span>
              <div>
                <strong>Anchor · at freeze</strong>
                <span>SHA-256 → public GitHub; daily Merkle root seals each day</span>
              </div>
            </div>
            <div className="rail-row">
              <span className="n">03</span>
              <div>
                <strong>Grade · after full time</strong>
                <span>log loss, RPS, Brier vs the result; originals kept forever</span>
              </div>
            </div>
            <div className="rail-foot">
              <Link to="/methodology">Methodology →</Link>
              <Link to="/engineering">Engineering →</Link>
            </div>
          </aside>
        </div>
      </Section>
    </div>
  );
}
