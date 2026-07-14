// Overview: hero + next-cutoff countdown + scope-chipped headline stats + next fixtures +
// the freeze→anchor→grade story. The countdown is pure client-side ticking.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { api, type UpcomingMatch } from "../../api";
import { Section } from "../../components/ui/Section";
import { StatTile } from "../../components/ui/StatTile";
import { Skeleton } from "../../components/ui/states";
import { cutoffOf, kickoffUTC, nats } from "../../lib/format";
import { useApi, type ApiState } from "../../lib/useApi";
import { useCountdown } from "../../lib/useCountdown";
import { FixtureCard } from "../forecasts/FixtureCard";

function Hero({ upcoming }: { upcoming: ApiState<UpcomingMatch[]> }) {
  // next freeze = earliest future cutoff among fixtures without an official forecast
  const target = useMemo(() => {
    const list = upcoming.data ?? [];
    const future = list
      .filter((m) => m.forecast?.type !== "official-frozen")
      .map((m) => cutoffOf(m.kickoff_utc))
      .filter((c) => c.getTime() > Date.now())
      .sort((a, b) => a.getTime() - b.getTime());
    return future[0] ?? null;
  }, [upcoming.data]);
  const cd = useCountdown(target);

  return (
    <div className="hero">
      <span className="eyebrow">MLS 1X2 · tamper-evident · read-only</span>
      <h1>Probabilistic MLS forecasts with a public, verifiable track record.</h1>
      <p className="sub">
        Every official forecast freezes at kickoff−3h, is SHA-256 hashed, anchored to a public
        git repository before the match starts, and graded automatically against the result.
        Honest by construction — including about what the model can't do.
      </p>
      {target && !cd.expired && (
        <div>
          <div className="countdown" aria-live="off">
            {[
              { v: cd.d, l: "days" },
              { v: cd.h, l: "hours" },
              { v: cd.m, l: "min" },
              { v: cd.s, l: "sec" },
            ].map((u) => (
              <span key={u.l} className="unit">
                <span className="value">{String(u.v).padStart(2, "0")}</span>
                <span className="label">{u.l}</span>
              </span>
            ))}
          </div>
          <p className="countdown-caption">
            until the next official forecast freezes —{" "}
            <time dateTime={target.toISOString()}>{kickoffUTC(target.toISOString())}</time>
          </p>
        </div>
      )}
      {target && cd.expired && (
        <p className="countdown-caption">An official forecast is freezing about now…</p>
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
              label="Test log loss (2025, touch-once)"
              value={testM.log_loss}
              format={nats}
              scope="test"
              n={testM.n ?? null}
              sub={
                testM.log_loss_ci95
                  ? `95% CI [${nats(testM.log_loss_ci95[0])}, ${nats(testM.log_loss_ci95[1])}]`
                  : undefined
              }
            />
          ) : (
            <Skeleton height={130} />
          )}
          {testM?.ece !== undefined ? (
            <StatTile
              label="Test calibration (ECE)"
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
              label="Dev log loss (walk-forward)"
              value={devM.log_loss}
              format={nats}
              scope="dev"
              n={devM.n ?? null}
              sub="2018–2024, expanding, leak-free"
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
            Drafts are preliminary until each fixture's cutoff. <Link to="/forecasts">All
            forecasts →</Link>
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
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
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
