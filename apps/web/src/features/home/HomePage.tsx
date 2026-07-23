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
import { MARKET_LOG_LOSS_TEST } from "../../lib/facts";
import { freezeRunOf, kickoffLocal, kickoffUTC, nats, teamName, timeLocal } from "../../lib/format";
import { matchPhase } from "../../lib/matchPhase";
import { useApi } from "../../lib/useApi";
import { useCountdown } from "../../lib/useCountdown";
import { useNow, useRelativeTime } from "../../lib/useRelativeTime";
import { FixtureCard } from "../forecasts/FixtureCard";
import { InPlaySection } from "../forecasts/InPlaySection";
import { PitchHero } from "./PitchHero";

function Hero() {
  const { nextCutoff, nextMatch, inPlay, list } = useUpcoming();
  const cd = useCountdown(nextCutoff);
  const now = useNow();

  // matchday takes the center spot: while games sit between kickoff and grade, a
  // "next freeze in 2 days" countdown would be the wrong headline for a live board
  const matchday = inPlay !== null && inPlay.length > 0;
  const nLive = matchday
    ? inPlay.filter(
        (m) =>
          matchPhase({ kickoff_utc: m.kickoff_utc, status: m.status, frozen: true, now }) ===
          "in-play",
      ).length
    : 0;
  const nAwaiting = matchday ? inPlay.length - nLive : 0;
  // upcoming is kickoff-ordered; only bill a "next kickoff" that's actually tonight AND
  // still in the future (a just-kicked-off game belongs to the in-play band, not here)
  const nextKo = matchday
    ? list?.find((m) => {
        const delta = new Date(m.kickoff_utc).getTime() - now;
        return delta > 0 && delta < 6 * 3600_000;
      })
    : undefined;

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
            expired={!matchday && !!nextCutoff && cd.expired}
            top={
              matchday ? (
                <>
                  {/* just "matchday" — on split slates a later fixture may still be
                      preliminary, so a blanket "forecasts sealed" claim could be false */}
                  <div className="fp-head">
                    <span className="pulse-dot" aria-hidden /> matchday
                  </div>
                  {/* reuses the countdown unit styling — the board's numeric voice */}
                  <div className="countdown">
                    {nLive > 0 && (
                      <span className="unit">
                        <span className="value">{String(nLive).padStart(2, "0")}</span>
                        <span className="label">in play</span>
                      </span>
                    )}
                    {nAwaiting > 0 && (
                      <span className="unit">
                        <span className="value">{String(nAwaiting).padStart(2, "0")}</span>
                        <span className="label">awaiting</span>
                      </span>
                    )}
                  </div>
                </>
              ) : nextCutoff ? (
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
              matchday ? (
                nextKo ? (
                  <div className="fc-match">
                    <span className="who">
                      {teamName(nextKo.home)} <span className="vs">vs</span>{" "}
                      {teamName(nextKo.away)}
                    </span>
                    <span className="when">
                      kicks off{" "}
                      <time dateTime={nextKo.kickoff_utc} title={kickoffUTC(nextKo.kickoff_utc)}>
                        {timeLocal(nextKo.kickoff_utc)}
                      </time>
                    </span>
                  </div>
                ) : (
                  <div className="fc-match">
                    <span className="when">results sync overnight · grading follows</span>
                  </div>
                )
              ) : nextMatch && nextCutoff && !cd.expired ? (
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
  const { list, inPlay } = useUpcoming();
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
        window{" "}
        <span className="v">
          {list ? `${list.length} upcoming` : "—"}
          {inPlay && inPlay.length > 0 ? ` · ${inPlay.length} in play` : ""}
        </span>
      </span>
    </div>
  );
}

export function HomePage() {
  const { list, totalGraded } = useUpcoming();
  const test = useApi(() => api.performance("test"));
  const dev = useApi(() => api.performance("dev"));

  const testM = test.data?.metrics;
  const devM = dev.data?.metrics;
  // ONE source for the live graded count everywhere: /predictions/completed via the shared
  // context (a live SQL count that refetches on matchday) — never the lagging snapshot n
  const liveN = totalGraded;

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
              sub="grades post automatically after full time · never back-filled"
            />
          ) : (
            <Skeleton height={130} />
          )}
          <StatusCell />
        </div>
        <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
          Log loss — lower is better. Guessing ⅓/⅓/⅓ every match scores 1.0986; on the same
          sealed test the closing market scored {MARKET_LOG_LOSS_TEST.toFixed(4)} — ahead of
          the model, and said so plainly. The full ladder is on{" "}
          <Link to="/performance">Performance</Link>.
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
