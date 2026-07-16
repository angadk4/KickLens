// Overview: split hero (copy + gradient freeze-card countdown), scope-chipped headline
// stats, next fixtures, and the freeze→anchor→grade story. Countdown is pure client-side.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { api, type UpcomingMatch } from "../../api";
import { Section } from "../../components/ui/Section";
import { StatTile } from "../../components/ui/StatTile";
import { Skeleton } from "../../components/ui/states";
import { cutoffOf, kickoffLocal, kickoffUTC, nats } from "../../lib/format";
import { useApi, type ApiState } from "../../lib/useApi";
import { useCountdown } from "../../lib/useCountdown";
import { FixtureCard } from "../forecasts/FixtureCard";

function Hero({ upcoming }: { upcoming: ApiState<UpcomingMatch[]> }) {
  // next freeze = earliest future cutoff among fixtures without an official forecast
  const next = useMemo(() => {
    const list = upcoming.data ?? [];
    const candidates = list
      .filter((m) => m.forecast?.type !== "official-frozen")
      .map((m) => ({ m, cutoff: cutoffOf(m.kickoff_utc) }))
      .filter((x) => x.cutoff.getTime() > Date.now())
      .sort((a, b) => a.cutoff.getTime() - b.cutoff.getTime());
    return candidates[0] ?? null;
  }, [upcoming.data]);
  const cd = useCountdown(next?.cutoff ?? null);

  return (
    <div className="hero">
      <div className="hero-copy">
        <span className="eyebrow">MLS 1X2 · tamper-evident · read-only</span>
        <h1>
          Probabilistic MLS forecasts with a <span className="grad-text">verifiable</span>{" "}
          public track record.
        </h1>
        <p className="sub">
          Every official forecast freezes 3 hours before kickoff, is SHA-256 hashed and
          anchored to a public git repository, then graded automatically against the result.
          Honest by construction — including about what the model can't do.
        </p>
        <div className="hero-ctas">
          <Link to="/forecasts" className="btn primary">
            View forecasts →
          </Link>
          <Link to="/methodology" className="btn ghost">
            How it's verified
          </Link>
        </div>
      </div>

      {next && !cd.expired && (
        <div className="freeze-card">
          <div className="freeze-card-inner">
            <div className="fc-head">
              <span>next official freeze</span>
              <span className="cursor">▮</span>
            </div>
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
                  return (
                    <span key={u.l} className={`unit ${zero ? "zero" : ""}`}>
                      <span className="value">{String(u.v).padStart(2, "0")}</span>
                      <span className="label">{u.l}</span>
                    </span>
                  );
                });
              })()}
            </div>
            <div className="fc-match">
              <span className="who">
                {next.m.home} <span className="vs">vs</span> {next.m.away}
              </span>
              <span className="when">
                freezes{" "}
                <time
                  dateTime={next.cutoff.toISOString()}
                  title={kickoffUTC(next.cutoff.toISOString())}
                >
                  {kickoffLocal(next.cutoff.toISOString())}
                </time>
              </span>
            </div>
          </div>
        </div>
      )}
      {next && cd.expired && (
        <div className="freeze-card">
          <div className="freeze-card-inner">
            <div className="fc-head">
              <span>freezing now</span>
              <span className="cursor">▮</span>
            </div>
            <p className="countdown-caption">
              An official forecast is being frozen and anchored about now.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function HomePage() {
  const upcoming = useApi(() => api.upcoming());
  const test = useApi(() => api.performance("test"));
  const dev = useApi(() => api.performance("dev"));
  const live = useApi(() => api.performance("live"));

  const testM = test.data?.metrics;
  const devM = dev.data?.metrics;
  // live n is known when the snapshot loads OR when 404 says none exists yet (truthfully 0);
  // an unreachable API must NOT claim 0
  const liveN = live.data?.metrics?.n ?? (live.notFound ? 0 : null);

  return (
    <div className="page">
      <Hero upcoming={upcoming} />

      <Section
        eyebrow="Headline evidence"
        title="The numbers, with their receipts"
        description="Four separate evidence scopes — development, the sealed one-shot test,
        labelled backtests, and the live record. They are never merged, and every figure
        carries its sample size."
      >
        <div className="grid-4">
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
              sub="best of all 8 evaluated models"
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
              sub="2018–2024 walk-forward, leak-free"
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
              sub="starts at zero — honestly"
            />
          ) : (
            <Skeleton height={130} />
          )}
        </div>
      </Section>

      <Section
        eyebrow="Next up"
        title="Upcoming fixtures"
        description={
          <>
            Drafts are preliminary until each fixture's cutoff.{" "}
            <Link to="/forecasts">All forecasts →</Link>
          </>
        }
      >
        {upcoming.data ? (
          <div className="grid-3">
            {upcoming.data.slice(0, 3).map((m) => (
              <FixtureCard key={m.match_id} m={m} />
            ))}
          </div>
        ) : (
          <div className="grid-3">
            <Skeleton height={160} />
            <Skeleton height={160} />
            <Skeleton height={160} />
          </div>
        )}
      </Section>

      <Section
        eyebrow="How it works"
        title="Freeze → Anchor → Grade"
        description="The pipeline that makes the record tamper-evident."
      >
        <div className="steps">
          <div className="step">
            <span className="n">01 · kickoff−3h</span>
            <h3>Freeze</h3>
            <p>
              The model predicts from point-in-time features; the official forecast is written
              once to an append-only ledger. Post-kickoff writes are rejected outright.
            </p>
          </div>
          <div className="step">
            <span className="n">02 · at creation</span>
            <h3>Anchor</h3>
            <p>
              The forecast's SHA-256 hash is committed to a public GitHub file before the match
              starts; a daily Merkle root seals each day. Anyone can verify any forecast.
            </p>
          </div>
          <div className="step">
            <span className="n">03 · after full time</span>
            <h3>Grade</h3>
            <p>
              Results are ingested automatically and every official forecast is scored (log
              loss, RPS, Brier). Corrections re-grade transparently — originals are kept
              forever.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
