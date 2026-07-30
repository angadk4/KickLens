// The live record — graded official forecasts only. Its empty state is a designed feature:
// the record starts at zero and nothing is ever back-filled.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { CardDetail } from "../../components/ui/CardDetail";
import { GoalMark } from "../../components/ui/GoalMark";
import { HashBadge } from "../../components/ui/HashBadge";
import { ProbBar } from "../../components/ui/ProbBar";
import { Reveal } from "../../components/ui/Reveal";
import { SealStrip } from "../../components/ui/SealStrip";
import { ScopeChip } from "../../components/ui/ScopeChip";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { useUpcoming } from "../../components/layout/UpcomingContext";
import { dateShort, kickoffLocal, nats, teamName } from "../../lib/format";
import { goalThreshold } from "../../lib/goalMark";
import { useApi } from "../../lib/useApi";
import { InPlaySection } from "../forecasts/InPlaySection";

/* SealChip lived here — a chip fetching merkleRoots(1) to show the latest daily seal. It has
   been replaced by <SealStrip/> below, which fetches merkleRoots(90) and whose rightmost cell
   IS that same latest seal, with its root and commit time in the title. Keeping both meant two
   requests for the same data and two ways to say one thing. */

const RESULT_LABEL = { H: "home win", D: "draw", A: "away win" } as const;

export function RecordPage() {
  const [limit, setLimit] = useState(50);
  const { data, error, loading, retrying, retry, refresh } = useApi(
    () => api.completed(limit),
    [limit],
  );
  // shared context: one fetch for upcoming + in-play, and the derived next-freeze instant
  const { list, inPlay, nextCutoff, totalGraded } = useUpcoming();
  // the record list is fetch-once; when the polled context sees new grades land, refetch —
  // a card leaving the in-play band must APPEAR in the record, not just vanish from above.
  // refresh(), NOT retry(): this is a healthy background sync, and retry() would flash a
  // false "API unreachable" banner. The ref fires ONCE per new count — if the refetch is
  // served by a still-fresh HTTP cache entry the effect must not tight-loop against it.
  const syncedAt = useRef<number | null>(null);
  useEffect(() => {
    if (
      totalGraded !== null &&
      data &&
      totalGraded > data.total_graded &&
      syncedAt.current !== totalGraded
    ) {
      syncedAt.current = totalGraded;
      refresh();
    }
  }, [totalGraded, data, refresh]);

  // ---- the grade landing, finally given a visible consequence. The refetch above used to be
  // completely silent. Rows whose match_id is new since the last render get `.landed`, and
  // their GoalMark's first-sight draw fires AT THE MOMENT the grade lands — already-built
  // motion, firing when it means something. Symmetric: `.landed` is a chalk-edge brighten
  // with no colour, and the GoalMark is symmetric by construction.
  const seenIds = useRef<Set<number> | null>(null);
  const [landed, setLanded] = useState<Set<number>>(new Set());

  // ---- pagination by GROWING THE WINDOW, not by offset-appending.
  // `offset` has existed on the endpoint since day one and was never used, so the record showed
  // at most 50 rows and printed "showing 50 of N" with no way forward: it visibly could not grow.
  // But offset paging is wrong here for two reasons, both real: the server orders by kickoff DESC
  // and NEW ROWS ARRIVE AT THE HEAD, so after a grade lands every later offset shifts by one and
  // an appended page duplicates one row and skips none-to-several; and `refresh()` re-runs the
  // ORIGINAL closure (limit 50, offset 0), which would leave already-appended pages stale beside
  // freshly-fetched head rows. Refetching one growing window keeps the list internally consistent
  // and makes the grade-landing refresh correct for free.
  const shown = data?.items ?? [];
  const pageBusy = loading && !retrying && shown.length > 0;

  // The `.landed` effect watches `shown`, i.e. the fetched page PLUS every paged-in row — it
  // watched only data.items at first, so paged rows never got the cue the comment promised.
  const shownKey = shown.map((i) => i.match_id).join(",");
  useEffect(() => {
    if (!shownKey) return;
    const ids = new Set(shownKey.split(",").map(Number));
    if (seenIds.current === null) {
      seenIds.current = ids; // first paint is never "landed"
      return;
    }
    const fresh = [...ids].filter((id) => !seenIds.current!.has(id));
    seenIds.current = ids;
    if (fresh.length === 0) return;
    setLanded(new Set(fresh));
    const t = setTimeout(() => setLanded(new Set()), 900);
    return () => clearTimeout(t);
  }, [shownKey]);
  // official forecasts already frozen but not yet graded — sealed upcoming AND kicked-off
  // (the in-play band), so a matchday empty state counts every sealed forecast
  const frozenAwaiting =
    (list?.filter((m) => m.forecast?.type === "official-frozen").length ?? 0) +
    (inPlay?.length ?? 0);
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
        {loading && !retrying && (
          <Skeleton height={160} ball label="loading the graded record…" />
        )}
        {(error || retrying) && (
          <ErrorState retry={retry} retrying={retrying} what="the graded record" />
        )}
        {data && data.total_graded === 0 && (
          <>
            {frozenAwaiting > 0 && (
              <span className="chip" style={{ justifySelf: "start" }}>
                {frozenAwaiting} official forecast{frozenAwaiting === 1 ? "" : "s"} frozen ·
                awaiting results
              </span>
            )}
            <EmptyState big="0" title="graded official forecasts">
              No official forecast has been graded yet —{" "}
              {frozenAwaiting > 0
                ? "official forecasts are frozen; grades follow the first full-time results."
                : nextCutoff && nextCutoff.getTime() > Date.now()
                  ? `the first freeze lands ${kickoffLocal(nextCutoff.toISOString())}, and grades follow the results.`
                  : nextCutoff
                    ? "the first official forecast is locked and anchors at the next hourly run."
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
              {/* the fetch is capped: never let the chip's n imply the list below is all of it */}
              {shown.length < data.total_graded && (
                <span className="chip">
                  showing {shown.length} of {data.total_graded}
                </span>
              )}
              <span className="chip">newest first</span>
              <span
                className="chip hint"
                tabIndex={0} /* the popover reveals on :focus-visible — keyboard-reachable */
                title="ln(3) — guessing ⅓/⅓/⅓ every match"
                data-hint="ln(3) — the log loss of guessing ⅓/⅓/⅓ every match. Scores below it mean the model knew something."
              >
                1.0986 = knew-nothing baseline
              </span>
            </div>
            {/* 90 days of daily seals, from the same endpoint the lone SealChip above uses —
                it just asks for 90 instead of 1. The record's tamper-evidence, countable. */}
            <SealStrip />
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              Small live samples are extremely noisy — judge this record in months, not
              matchdays. The goal mouth on each card plots p(actual): the probability the
              frozen forecast gave to the result that happened (= e<sup>−log loss</sup>, the
              same number as the chip). The tick marked ⅓ is what a knew-nothing guess would
              have given, so the ball's position against it says whether the forecast beat
              guessing — and its roll starts there on every card, so nothing is flattered.
              Every card gets the identical mark: a hit at 36% and a miss at 34% look almost
              the same, because they almost are. The ball reaches the net only from{" "}
              {(Math.floor(goalThreshold() * 1000) / 10).toFixed(1)}% up.
            </p>
            {/* Reveal, not the page's single <Section>: that Section starts above the fold,
                so its one skip decision meant NOTHING on this page could ever animate. */}
            <Reveal className="grid-2 settle-stagger">
              {shown.map((it) => (
                <Link
                  key={it.match_id}
                  to={`/match/${it.match_id}`}
                  className={`card fixture-card stamped${landed.has(it.match_id) ? " landed" : ""}`}
                >
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
                    {/* both outcomes neutral: the ✓/✗ words stay, the colour verdict is
                        gone — the goal mark below carries the continuous truth instead */}
                    <Badge
                      kind="none"
                      label={it.correct ? "✓ top pick hit" : "top pick missed"}
                    />
                    <HashBadge hash={it.forecast_hash} />
                  </div>
                  {/* the same mark on every card: the ball at e^−log loss — derived from
                      the STORED grade (the chip's own number), so mark and chip can never
                      disagree, even inside a result-correction regrade window. decorative:
                      50 repeated aria sentences would bloat every link's accessible name */}
                  <GoalMark p={Math.exp(-it.log_loss)} decorative />
                  {/* brier arrives on every graded item and was never rendered anywhere */}
                  {typeof it.brier === "number" && (
                    <CardDetail>brier {nats(it.brier)} · graded automatically</CardDetail>
                  )}
                </Link>
              ))}
            </Reveal>
            {shown.length < data.total_graded && (
              <button
                type="button"
                className={`btn ghost${pageBusy ? " busy" : ""}`}
                onClick={() => setLimit((n) => n + 50)}
                aria-disabled={pageBusy || undefined}
                aria-busy={pageBusy || undefined}
                style={{ justifySelf: "start" }}
              >
                {pageBusy && <span className="spinner" aria-hidden />}
                {pageBusy
                  ? "loading…"
                  : `load the next ${Math.min(50, data.total_graded - shown.length)}`}
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
