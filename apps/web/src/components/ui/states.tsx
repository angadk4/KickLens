// Loading / empty / error building blocks. Empty states say WHY they're empty and WHEN
// they fill — honest emptiness is part of the brand, never papered over.
import type { ReactNode } from "react";
import { canJuggle, KJ_CX, KJ_CY, KJ_R, kjSeamPath } from "../../lib/skeletonBall";

export function Skeleton({
  height = 120,
  ball = false,
  label,
}: {
  height?: number;
  /** the juggling ball — opt-in, ONE per screen, only where the skeleton IS the page's
      content; a hard height floor keeps it out of card grids (lib/skeletonBall) */
  ball?: boolean;
  label?: string;
}) {
  const juggle = ball && canJuggle(height);
  if (!juggle && !label) {
    return <div className="skeleton" style={{ height }} aria-hidden />;
  }
  // the first loading state that announces itself: the plain skeleton is aria-hidden,
  // so screen readers used to hear silence during every fetch
  return (
    <div className="skeleton sk-live" style={{ height }} role="status">
      {juggle && (
        <svg className="sk-ball" viewBox="0 0 48 64" aria-hidden>
          <g className="kj-bob">
            <g className="kj-spin">
              <circle className="skb-line" cx={KJ_CX} cy={KJ_CY} r={KJ_R} />
              <path className="skb-line" d={kjSeamPath()} />
            </g>
          </g>
        </svg>
      )}
      <span className="sk-label">{label ?? "loading…"}</span>
    </div>
  );
}

export function EmptyState({
  big,
  title,
  children,
}: {
  big?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {big && <span className="big">{big}</span>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Render as `(error || retrying) && <ErrorState … retrying={retrying} />` so the banner
    survives its own retry as a busy state — a Neon cold start takes seconds, and a banner
    that vanishes into a skeleton reads as a second failure. */
export function ErrorState({
  retry,
  retrying,
  what,
}: {
  retry?: () => void;
  retrying?: boolean;
  /** what failed to load ("the graded record", "match details") — six identical
      sentences become six accurate ones */
  what?: string;
}) {
  return (
    // role="status": a failed fetch used to be silent to screen readers
    <div className="banner error" role="status">
      {/* the ball out of play, beyond the touchline — placement #4 of the closed set */}
      <svg className="es-mark" viewBox="0 0 40 24" aria-hidden>
        <line className="skb-line" x1={27} y1={2} x2={27} y2={22} />
        <circle className="skb-line" cx={11} cy={16} r={5.5} />
      </svg>
      <span>
        Couldn't load {what ?? "this data"} — the API is unreachable. Showing nothing
        rather than something stale without saying so.{" "}
        {retry && (
          /* aria-disabled, NOT disabled: a disabled button drops keyboard focus to <body>
             mid-interaction — the click is guarded instead and the button stays focusable */
          <button
            type="button"
            className={`btn sm${retrying ? " busy" : ""}`}
            onClick={retrying ? undefined : retry}
            aria-disabled={retrying || undefined}
            aria-busy={retrying || undefined}
          >
            {retrying && <span className="spinner" aria-hidden />}
            {retrying ? "retrying — a cold start can take a few seconds…" : "retry"}
          </button>
        )}
      </span>
    </div>
  );
}
