// The signature: a chalk center circle straddling the halfway line — the countdown sits
// at the center spot because everything here happens before kickoff. The chalk draws
// itself ONCE per browser session (the site's single orchestrated motion moment);
// reduced motion and later visits render the finished pitch instantly.
import { useMemo, type ReactNode } from "react";

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
          <circle className="ph-spot" cx="150" cy="150" r="3.5" />
        </svg>
        {top && <div className="ph-top">{top}</div>}
        {bottom && <div className="ph-bottom">{bottom}</div>}
      </div>
    </div>
  );
}
