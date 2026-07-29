// The signature: a chalk center circle straddling the halfway line — the countdown sits
// at the center spot because everything here happens before kickoff. The chalk draws
// itself ONCE per browser session (the site's single orchestrated motion moment);
// reduced motion and later visits render the finished pitch instantly.
// THE BALL sits on the center spot (it replaced the spot dot — a filled dot inside a
// stroked ring read as a bullseye) and arrives as the cascade's final beat. Geometry
// lives in lib/pitchBall (unit-tested: it must never crowd the countdown's band).
import { useMemo, type ReactNode } from "react";
import { BALL_CX, BALL_CY, BALL_R, seamPath } from "../../lib/pitchBall";

const DRAWN_KEY = "kl-hero-drawn";

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
  const drawn = useMemo(() => {
    try {
      if (sessionStorage.getItem(DRAWN_KEY)) return true;
      sessionStorage.setItem(DRAWN_KEY, "1");
      return false;
    } catch {
      return true; // storage unavailable → skip the animation, show the finished pitch
    }
  }, []);
  return (
    <div className={`pitch-hero${drawn ? " drawn" : ""}${expired ? " expired" : ""}`}>
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
