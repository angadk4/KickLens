// The signature: a chalk center circle straddling the halfway line — the countdown sits
// at the center spot because everything here happens before kickoff. The chalk draws
// itself on arrival (the orchestrated moment, 1100ms); reduced motion renders the
// finished pitch instantly via the global killswitch.
//
// It used to be gated to once per browser session by a sessionStorage read-THEN-write
// inside a useMemo. StrictMode double-invokes that factory, so pass 2 read the flag pass 1
// had just written, `drawn` came back true, and the cascade SUPPRESSED ITSELF on every dev
// reload — the site's one moment was invisible on the machine building it. The gate is
// gone: it animates chalk strokes only (content paints instantly), it is one route of ten,
// and an animation nobody ever sees is not a feature. lib/oncePerSession.ts holds the
// correct read-in-render / write-in-effect pattern for where a real gate IS needed.
//
// THE BALL sits on the center spot (it replaced the spot dot — a filled dot inside a
// stroked ring read as a bullseye) and arrives as the cascade's final beat. Geometry
// lives in lib/pitchBall (unit-tested: it must never crowd the countdown's band).
import type { ReactNode } from "react";
import { BALL_CX, BALL_CY, BALL_R, seamPath } from "../../lib/pitchBall";

export function PitchHero({
  expired = false,
  top,
  bottom,
}: {
  expired?: boolean;
  /** content above the halfway line (label + countdown) */
  top?: ReactNode;
  /** content below the line (the fixture) */
  bottom?: ReactNode;
}) {
  return (
    <div className={`pitch-hero${expired ? " expired" : ""}`}>
      <div className="hw-line" aria-hidden />
      <div className="ph-cell">
        <svg className="ph-svg" viewBox="0 0 300 300" aria-hidden>
          <circle
            className="ph-circle"
            cx="150"
            cy="150"
            r="148"
            pathLength={1}
            transform="rotate(-90 150 150)"
          />
          {/* inner g carries the hover roll (transition) — kept separate from any future
              transform animation on the outer g: on one element the animation wins */}
          <g className="ph-ball">
            <g className="ph-ball-roll">
              <circle
                className="ph-ball-line"
                cx={BALL_CX}
                cy={BALL_CY}
                r={BALL_R}
                pathLength={1}
              />
              <path className="ph-ball-seam" d={seamPath()} pathLength={1} />
            </g>
          </g>
        </svg>
        {top && <div className="ph-top">{top}</div>}
        {bottom && <div className="ph-bottom">{bottom}</div>}
      </div>
    </div>
  );
}
