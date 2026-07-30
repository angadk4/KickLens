// The signature: a chalk centre circle straddling the halfway line — the countdown sits at
// the centre spot because everything here happens before kickoff. The chalk draws itself on
// arrival (1100ms); reduced motion renders the finished pitch via the global killswitch.
//
// The session gate is gone. It used to be a sessionStorage read-THEN-write inside a useMemo,
// which StrictMode double-invoked, so pass 2 read the flag pass 1 had written and the cascade
// suppressed itself on every dev reload. The cascade now replays on every mount.
//
// THE BALL is the hero's living element, and it is DELIBERATELY NOT INTERACTIVE. It rolls
// back and forth along the halfway line (the corridor is ~9× its own diameter: .ph-top and
// .ph-bottom are anchored to bottom/top:50%, so they constrain the ball vertically and not at
// all horizontally), bounces once a second, and squashes on contact. Pure CSS, four nested
// transform layers, because two animations writing `transform` on one element don't compose —
// the later one wins outright.
//
// It USED to be kickable: pointer, drag-and-flick, touch and keyboard, on a physics
// integrator, with keepy-uppie counts and a floodlight flare on a hard hit. The developer
// removed all of it — "I don't like the whole keep up all that stuff, it's gonna be hard to
// get it right. Just keep it non interactive but rolling and bouncing." So the hero now has
// no interactive surface at all, and lib/ballPhysics.ts, lib/flare.ts and the hit target are
// gone rather than left dormant. docs/motion.md records the decision.
import { useState, type ReactNode } from "react";
import {
  BALL_CX,
  BALL_CY,
  BALL_R,
  ballPatches,
  ballSeams,
  beatPhaseMs,
  BEAT_RISE,
  rollDegrees,
  ROLL_X,
} from "../../lib/pitchBall";

// Static ids: exactly one hero exists per page. They are referenced by url(#…) below, which
// is same-document and therefore unaffected by the CSP.
const CLIP = "ph-ball-clip";
const SHEEN = "ph-ball-sheen";
const SHADE = "ph-ball-shade";

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
  // the bounce is phase-locked to the wall clock, so the ball lands WITH the seconds digit
  const [beatPhase] = useState(() => beatPhaseMs(Date.now()));

  return (
    <div className={`pitch-hero${expired ? " expired" : ""}`}>
      <div className="hw-line" aria-hidden />
      {/* The ball's whole geometry is written here, from lib/pitchBall, so the CSS cannot
          drift from it. --ph-roll (travel) and --ph-roll-deg (the rotation that travel
          implies) used to be two literals in two files kept in step by a unit test; deriving
          the second from the first is strictly better than asserting they match, and a skid
          is now unrepresentable. */}
      <div
        className="ph-cell"
        style={{
          ["--beat-phase" as string]: `-${beatPhase}ms`,
          ["--ph-roll" as string]: `${ROLL_X}px`,
          ["--ph-roll-deg" as string]: `${rollDegrees(ROLL_X, BALL_R)}deg`,
          ["--ph-beat" as string]: `${BEAT_RISE}px`,
        }}
      >
        <svg className="ph-svg" viewBox="0 0 300 300" aria-hidden>
          <defs>
            {/* the rim patches overrun the outline and are cut by it — that truncation is
                what makes a flat pentagon layout read as a sphere */}
            <clipPath id={CLIP}>
              <circle cx={BALL_CX} cy={BALL_CY} r={BALL_R} />
            </clipPath>
            {/* the floodlights are at 18%/82% top, so the ball is lit from above-left */}
            <radialGradient id={SHEEN} cx="34%" cy="26%" r="72%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={SHADE} cx="60%" cy="70%" r="86%">
              <stop offset="38%" stopColor="#0f1813" stopOpacity="0" />
              <stop offset="100%" stopColor="#0f1813" stopOpacity="0.5" />
            </radialGradient>
          </defs>
          <circle
            className="ph-circle"
            cx="150"
            cy="150"
            r="148"
            pathLength={1}
            transform="rotate(-90 150 150)"
          />
          {/* One transform per layer, because two animations writing `transform` on one
              element do not compose — the later one wins outright:
                .ph-ball-roll  ambient translateX along the halfway line
                .ph-beat       the 1s bounce + contact squash
                .ph-ball-in    the cascade's fourth beat: the ball arrives (one-shot)
                .ph-ball-spin  ambient rotation, phase-locked to the roll */}
          <g className="ph-ball-roll">
            <g className="ph-beat">
              <g className="ph-ball-in">
                <g className="ph-ball-spin">
                  <circle className="ph-ball-skin" cx={BALL_CX} cy={BALL_CY} r={BALL_R} />
                  <g clipPath={`url(#${CLIP})`}>
                    {ballSeams().map((s, i) => (
                      <line key={`s${i}`} className="ph-ball-seam" {...s} />
                    ))}
                    {ballPatches().map((d, i) => (
                      <path key={`p${i}`} className="ph-ball-patch" d={d} />
                    ))}
                  </g>
                </g>
                {/* the light does NOT rotate with the ball — a fixed highlight over turning
                    patches is what makes the rotation legible at 32px */}
                <circle
                  className="ph-ball-light"
                  cx={BALL_CX}
                  cy={BALL_CY}
                  r={BALL_R}
                  fill={`url(#${SHEEN})`}
                />
                <circle
                  className="ph-ball-light"
                  cx={BALL_CX}
                  cy={BALL_CY}
                  r={BALL_R}
                  fill={`url(#${SHADE})`}
                />
              </g>
            </g>
          </g>
        </svg>
        {top && <div className="ph-top">{top}</div>}
        {bottom && <div className="ph-bottom">{bottom}</div>}
      </div>
    </div>
  );
}
