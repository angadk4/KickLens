// The signature: a chalk center circle straddling the halfway line — the countdown sits at
// the center spot because everything here happens before kickoff. The chalk draws itself on
// arrival (1100ms); reduced motion renders the finished pitch via the global killswitch.
//
// The session gate is gone. It used to be a sessionStorage read-THEN-write inside a useMemo,
// which StrictMode double-invoked, so pass 2 read the flag pass 1 had written and the cascade
// suppressed itself on every dev reload. See lib/oncePerSession.ts for the correct pattern.
//
// THE BALL is the hero's living element, and it does two things:
//   AMBIENT — it rolls back and forth along the halfway line (the corridor is ~9× its own
//   diameter: .ph-top/.ph-bottom are anchored to bottom/top:50%, so they constrain the ball
//   vertically and not at all horizontally) with a per-second bounce and a squash on contact.
//   Pure CSS, three nested transform layers because two animations writing `transform` on one
//   element don't compose — the later one wins outright.
//   KICKABLE — click, drag, flick, or use the keyboard and it becomes a real physics object
//   that bounces off the chalk circle and off the copy blocks, spins from its own travel, and
//   settles back onto the spot. lib/ballPhysics.ts is pure and unit-tested; the loop runs on
//   framer-motion's existing shared frameloop and CANCELS ITSELF the frame the ball sleeps,
//   so there is no persistent rAF (docs/motion.md rule 7 + its transient exemption).
import { cancelFrame, frame } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  asleep,
  clampImpulse,
  CX,
  CY,
  keyImpulse,
  MAX_FRAME,
  MAX_KICK_MS,
  restingClear,
  step,
  SUB,
  tapImpulse,
  type Ball,
  type Rect,
} from "../../lib/ballPhysics";
import { flare } from "../../lib/flare";
import { markSeen, seenThisSession } from "../../lib/oncePerSession";
import {
  BALL_CX,
  BALL_CY,
  BALL_R,
  beatPhaseMs,
  equatorPath,
  litPath,
  PLAY_R,
  seamPath,
} from "../../lib/pitchBall";
import { useMediaQuery } from "../../lib/useMediaQuery";

const KICKED_KEY = "kl-ball-kicked";
const NUDGE_KEY = "kl-ball-nudged";
const PB_KEY = "kl.pb.v1";

/** Measure the copy blocks in viewBox units. Ranges over the CONTENTS, not the elements:
    .ph-top/.ph-bottom are centred grids inset 10-14%, so their boxes are far wider than the
    text inside them — the range's union hugs the real copy and gives the ball the real lanes
    instead of fake walls. */
function measureObstacles(cell: HTMLElement, svg: SVGSVGElement): Rect[] {
  const s = svg.getBoundingClientRect();
  if (s.width === 0) return [];
  const k = 300 / s.width; // CSS px → viewBox units
  const out: Rect[] = [];
  for (const sel of [".ph-top", ".ph-bottom"]) {
    const el = cell.querySelector(sel);
    if (!el) continue;
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    if (b.width > 0) {
      out.push({
        x0: (b.left - s.left) * k,
        y0: (b.top - s.top) * k,
        x1: (b.right - s.left) * k,
        y1: (b.bottom - s.top) * k,
      });
    }
  }
  return out;
}

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
  const cellRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ballRef = useRef<SVGGElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);

  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [hinted] = useState(() => !seenThisSession(KICKED_KEY));
  const [showHint, setShowHint] = useState(hinted);
  // keepy-uppies: shown ONLY while a rally is live, in the site's own numeric voice. Bare
  // numerals, no jokes — copy is where an easter egg turns gimmicky.
  const [rally, setRally] = useState(0);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem(PB_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  // replaying the chalk cascade is a labelled CONTROL, not a hidden trigger — and it is the
  // permanent answer to "I never saw the hero animation"
  const [drawKey, setDrawKey] = useState(0);
  const redrawAt = useRef(0);

  // physics state lives in refs: the loop writes transforms directly and must never re-render
  const state = useRef<Ball>({ p: { x: CX, y: CY }, v: { x: 0, y: 0 }, spin: 0 });
  const obstacles = useRef<Rect[]>([]);
  const acc = useRef(0);
  const live = useRef(false);
  const startedAt = useRef(0);
  const compass = useRef(0);
  const drag = useRef<{
    id: number;
    /** the ball's position when the grab started, so a drag is relative and never jumps */
    ox: number;
    oy: number;
    x: number;
    y: number;
    /** previous sample, for the smoothed instantaneous release velocity */
    px: number;
    py: number;
    pt: number;
    vx: number;
    vy: number;
    moved: number;
  } | null>(null);

  // the bounce is phase-locked to the wall clock, so the ball lands WITH the seconds digit
  const [beatPhase] = useState(() => beatPhaseMs(Date.now()));

  const paint = useCallback(() => {
    const g = ballRef.current;
    const btn = hitRef.current;
    const s = state.current;
    const dx = s.p.x - CX;
    const dy = s.p.y - CY;
    const deg = s.spin * (180 / Math.PI);
    // ONE statement per element, so the two transforms can never desync
    if (g) g.style.transform = `translate(${dx}px, ${dy}px) rotate(${deg}deg)`;
    if (btn && svgRef.current) {
      const k = svgRef.current.getBoundingClientRect().width / 300 || 1;
      btn.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    }
  }, []);

  const tick = useCallback(
    ({ delta }: { delta: number }) => {
      acc.current += Math.min(MAX_FRAME, delta / 1000);
      let guard = 0;
      while (acc.current >= SUB && guard++ < 24) {
        acc.current -= SUB;
        const before = state.current;
        state.current = step(before, SUB, BALL_R, PLAY_R, obstacles.current);
        // a HARD strike on the chalk ring makes the pitch flinch. Detected as "was fast and
        // is now at the boundary", so it can only fire on a real smash.
        const speed = Math.hypot(before.v.x, before.v.y);
        const atRing = Math.hypot(state.current.p.x - CX, state.current.p.y - CY) >= PLAY_R - 0.5;
        if (speed > 600 && atRing) flare();
      }
      paint();
      // asleep OR the watchdog. The watchdog is the important half: suspending the CSS ambient
      // loops during a kick means a loop that ends without stop() would strand the ball
      // permanently, so "a kick always ends" is enforced rather than hoped for.
      if (asleep(state.current) || Date.now() - startedAt.current > MAX_KICK_MS) stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paint],
  );

  /** Halt the integrator but LEAVE the ball where it is. Used when a drag grabs a ball that is
      still in flight: stop() would teleport it home under the user's finger. */
  const freeze = useCallback(() => {
    if (!live.current) return;
    live.current = false;
    cancelFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /** The kick is over: park the ball on the spot and hand every property back to CSS. */
  const stop = useCallback(() => {
    // NOT `if (!live.current) return` — a drag that never became a kick leaves .ph-kicked on
    // and an inline transform written, with the loop never having started. Bailing out here
    // would strand the ambient animations off forever.
    if (live.current) {
      live.current = false;
      cancelFrame(tick);
    }
    state.current = { p: { x: CX, y: CY }, v: { x: 0, y: 0 }, spin: 0 };
    // CLEAR the inline transforms rather than writing an identity one: an inline style beats
    // every stylesheet rule, so leaving one behind would permanently disable the hover hop and
    // the button's ambient tracking. Handing the property back to CSS is the whole handoff.
    const g = ballRef.current;
    if (g) {
      g.style.transform = "";
      g.style.willChange = "";
    }
    if (hitRef.current) hitRef.current.style.transform = "";
    cellRef.current?.classList.remove("ph-kicked");
    setRally(0); // the rally ends when the ball rests
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, paint]);

  /** The ball's CURRENT on-screen centre, in viewBox units — including the ambient roll, which
      the physics knows nothing about. Every kick must start from here: `.ph-kicked` deletes the
      ambient transform in the same frame, so starting from (CX,CY) instead made the ball snap
      up to 48 units sideways before it flew, on every keyboard kick and every self-kick. */
  const ballCentre = useCallback((): { x: number; y: number } => {
    const svg = svgRef.current;
    const box = ballRef.current?.getBoundingClientRect();
    const svgBox = svg?.getBoundingClientRect();
    if (!box || !svgBox || svgBox.width === 0) return { x: CX, y: CY };
    const k = 300 / svgBox.width;
    return {
      x: (box.left + box.width / 2 - svgBox.left) * k,
      y: (box.top + box.height / 2 - svgBox.top) * k,
    };
  }, []);

  const start = useCallback(
    (impulse: { x: number; y: number }) => {
      if (reduced) return;
      const cell = cellRef.current;
      const svg = svgRef.current;
      if (!cell || !svg) return;
      obstacles.current = measureObstacles(cell, svg);
      if (import.meta.env.DEV && !restingClear(BALL_R, obstacles.current)) {
        console.warn("[PitchHero] the resting ball overlaps a measured copy block");
      }
      // seed from where the ball actually IS, BEFORE .ph-kicked removes the ambient transform
      if (!live.current) state.current = { ...state.current, p: ballCentre() };
      // ph-kicked suspends the CSS ambient animations so JS owns the transform outright
      cell.classList.add("ph-kicked");
      const g = ballRef.current;
      if (g) g.style.willChange = "transform";
      state.current = { ...state.current, v: clampImpulse(impulse) };
      acc.current = 0;
      // EVERY kick refreshes the watchdog, not just the first. Stamping it inside the
      // `!live.current` branch meant a keyboard rally (which keeps the loop alive) was
      // force-stopped 6s after its FIRST kick, mid-rally.
      startedAt.current = Date.now();
      if (!live.current) {
        live.current = true;
        frame.update(tick, true);
      }
    },
    [reduced, tick, ballCentre],
  );

  /** Retire the hint — only a REAL kick counts. The one-per-session self-kick must not, or
      the hint is consumed before the visitor ever reads it. Also counts keepy-uppies: kicking
      again before the ball rests continues a rally; letting it sleep resets. */
  const kicked = useCallback(
    (impulse: { x: number; y: number }) => {
      const rallying = live.current;
      start(impulse);
      setRally((n) => {
        const next = rallying ? n + 1 : 1;
        if (next > best) {
          setBest(next);
          try {
            localStorage.setItem(PB_KEY, String(next));
          } catch {
            /* private mode: the counter is session-only, which is fine */
          }
        }
        return next;
      });
      setShowHint((was) => {
        if (was) markSeen(KICKED_KEY);
        return false;
      });
    },
    [start, best],
  );

  // Flipping the OS setting mid-flight must stop a JS-set transform — the CSS killswitch
  // provably cannot reach one. This is the concrete reason rule 3 names useMediaQuery.
  useEffect(() => {
    if (reduced) stop();
  }, [reduced, stop]);

  useEffect(() => () => stop(), [stop]);

  // re-measure on resize / font swap / a late-arriving fixture name
  useEffect(() => {
    const cell = cellRef.current;
    const svg = svgRef.current;
    if (!cell || !svg || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      obstacles.current = measureObstacles(cell, svg);
    });
    ro.observe(cell);
    return () => ro.disconnect();
  }, []);

  // ONE self-kick per session, as the cascade's final beat — so the page moves by itself on
  // arrival, which is exactly the complaint. Not an ambient loop.
  useEffect(() => {
    if (reduced || seenThisSession(NUDGE_KEY)) return;
    const t = setTimeout(() => {
      markSeen(NUDGE_KEY);
      start({ x: 210, y: -120 });
    }, 1150);
    return () => clearTimeout(t);
  }, [reduced, start]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (reduced) return;
    if (drag.current) return; // one pointer owns the ball at a time
    e.currentTarget.setPointerCapture(e.pointerId);
    // FREEZE, not stop(): stop() parks the ball on the centre spot, so grabbing a ball that was
    // still in flight teleported it home out from under the finger that grabbed it.
    freeze();
    // grab from wherever the ball actually IS — including mid-flight, and including the ambient
    // roll offset, which the physics does not know about. `origin` is the ball's position at
    // grab time, so the drag is relative and the ball does not jump on the first move.
    const cell = cellRef.current;
    const svg = svgRef.current;
    if (cell && svg) {
      obstacles.current = measureObstacles(cell, svg);
      const ballBox = ballRef.current?.getBoundingClientRect();
      const svgBox = svg.getBoundingClientRect();
      if (ballBox && svgBox.width > 0) {
        const k = 300 / svgBox.width;
        state.current = {
          ...state.current,
          p: {
            x: (ballBox.left + ballBox.width / 2 - svgBox.left) * k,
            y: (ballBox.top + ballBox.height / 2 - svgBox.top) * k,
          },
          v: { x: 0, y: 0 },
        };
      }
      cell.classList.add("ph-kicked");
      paint();
    }
    drag.current = {
      id: e.pointerId,
      ox: state.current.p.x,
      oy: state.current.p.y,
      x: e.clientX,
      y: e.clientY,
      px: e.clientX,
      py: e.clientY,
      pt: e.timeStamp,
      vx: 0,
      vy: 0,
      moved: 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || d.id !== e.pointerId || !svg) return;
    const k = 300 / (svg.getBoundingClientRect().width || 300);
    // INSTANTANEOUS velocity, exponentially smoothed. The flick used to be computed from the
    // whole gesture (total delta ÷ total time), so a slow drag ending in a quick snap released
    // a feeble kick, and a fast drag ending stationary released a hard one — both backwards.
    const dt = Math.max(8, e.timeStamp - d.pt) / 1000;
    const ivx = ((e.clientX - d.px) * k) / dt;
    const ivy = ((e.clientY - d.py) * k) / dt;
    d.vx = d.vx * 0.6 + ivx * 0.4;
    d.vy = d.vy * 0.6 + ivy * 0.4;
    d.moved += Math.hypot(e.clientX - d.px, e.clientY - d.py);
    d.px = e.clientX;
    d.py = e.clientY;
    d.pt = e.timeStamp;
    // while dragging the ball follows the pointer exactly, clamped to the ring
    const nx = d.ox + (e.clientX - d.x) * k;
    const ny = d.oy + (e.clientY - d.y) * k;
    const dist = Math.hypot(nx - CX, ny - CY);
    const s = dist > PLAY_R ? PLAY_R / dist : 1;
    state.current = {
      ...state.current,
      p: { x: CX + (nx - CX) * s, y: CY + (ny - CY) * s },
      spin: state.current.spin + (e.clientX - d.px) * k * 0.004,
    };
    paint();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const svg = svgRef.current;
    // check identity BEFORE consuming the drag: a second pointer's up/cancel used to null and
    // act on the first pointer's drag, releasing a kick the owner never asked for
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!svg) {
      stop(); // no geometry to kick with — never leave .ph-kicked on
      return;
    }
    const k = 300 / (svg.getBoundingClientRect().width || 300);
    if (d.moved < 3) {
      // a click, not a drag: an AIMED strike away from the point you hit
      const box = svg.getBoundingClientRect();
      // aim from where the ball IS (d.ox/d.oy was captured at grab time, ambient roll included),
      // not from the geometric centre spot — otherwise the "aimed strike" points the wrong way by
      // the whole roll offset
      kicked(
        tapImpulse(
          { x: (e.clientX - box.left) * k, y: (e.clientY - box.top) * k },
          { x: d.ox, y: d.oy },
        ),
      );
      return;
    }
    // the smoothed instantaneous velocity from the tail of the gesture, not the whole-drag
    // average — a flick is what the hand was doing at RELEASE
    kicked({ x: d.vx, y: d.vy });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const arrows: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -420 },
      ArrowDown: { x: 0, y: 420 },
      ArrowLeft: { x: -420, y: 0 },
      ArrowRight: { x: 420, y: 0 },
    };
    if (e.key in arrows) {
      e.preventDefault(); // only while the ball holds focus; page scroll is untouched otherwise
      kicked(arrows[e.key]!);
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      kicked(keyImpulse(compass.current++));
      return;
    }
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      redraw();
    }
  };

  /** Replay the chalk cascade. Remounting the <svg> via a key restarts its CSS animations —
      the simplest correct way to re-run a one-shot keyframe. 2s cooldown. */
  const redraw = () => {
    const t = Date.now();
    if (t - redrawAt.current < 2000) return;
    redrawAt.current = t;
    stop();
    setDrawKey((k) => k + 1);
  };

  return (
    <div className={`pitch-hero${expired ? " expired" : ""}`}>
      <div className="hw-line" aria-hidden />
      {/* --beat-phase lives on the CELL, not on .ph-beat: the hit button is a SIBLING of the
          svg, so a variable set inside the svg never reached it and its bounce ran out of phase
          with the ball's. Both read it from here. */}
      <div
        className="ph-cell"
        ref={cellRef}
        style={{ ["--beat-phase" as string]: `-${beatPhase}ms` }}
      >
        <svg key={drawKey} ref={svgRef} className="ph-svg" viewBox="0 0 300 300" aria-hidden>
          <circle
            className="ph-circle"
            cx="150"
            cy="150"
            r="148"
            pathLength={1}
            transform="rotate(-90 150 150)"
          />
          {/* One transform per layer, because two animations writing `transform` on one element
              do not compose — the later one wins outright:
                .ph-ball-roll  CSS ambient translateX along the halfway line
                .ph-beat       CSS 1s bounce + contact squash
                .ph-hop        CSS hover/focus hop (its own layer: JS writes .ph-ball inline,
                               and an inline style would beat the hop's rule forever)
                .ph-ball       JS physics translate + rotate while kicked
                .ph-ball-spin  CSS ambient rotation, phase-locked to the roll */}
          <g className="ph-ball-roll">
            <g className="ph-beat">
              <g className="ph-hop">
                <g className="ph-ball" ref={ballRef}>
                  <g className="ph-ball-spin">
                    <circle
                      className="ph-ball-line"
                      cx={BALL_CX}
                      cy={BALL_CY}
                      r={BALL_R}
                      pathLength={1}
                    />
                    <path className="ph-ball-seam" d={seamPath()} pathLength={1} />
                    <path className="ph-ball-seam" d={equatorPath()} pathLength={1} />
                  </g>
                  {/* the floodlit crescent never rotates — a fixed highlight over a turning
                      seam is what makes the rotation legible at this size */}
                  <path className="ph-ball-lit" d={litPath()} pathLength={1} />
                </g>
              </g>
            </g>
          </g>
        </svg>
        {top && <div className="ph-top">{top}</div>}
        {bottom && <div className="ph-bottom">{bottom}</div>}
        {/* The real control: a transparent 36px target that TRACKS the ball, so the focus ring
            travels with it. The SVG is aria-hidden decoration and pointer-events:none. Not
            rendered under reduced motion — a toy whose whole content is motion has nothing
            honest to offer in a still state. */}
        {!reduced && (
          <button
            key={drawKey}
            ref={hitRef}
            type="button"
            className="ph-ball-hit"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            <span className="sr-only">
              Kick the ball — space, enter, or the arrow keys. Press R to redraw the pitch.
            </span>
          </button>
        )}
        {showHint && !reduced && rally === 0 && (
          <span className="ph-hint" aria-hidden>
            ↑ kick it
          </span>
        )}
        {/* keepy-uppies: visible ONLY during a live rally, in bare numerals. It vanishes the
            moment the ball rests, so it is never sitting there as decoration. */}
        {rally > 1 && !reduced && (
          <span className="ph-rally" aria-hidden>
            keepy-uppies {String(rally).padStart(2, "0")}
            {best > rally ? ` · best ${String(best).padStart(2, "0")}` : ""}
          </span>
        )}
        {/* a labelled control, not a hidden egg — and the permanent fix for "I never saw the
            hero animation": there is now a way to watch it on demand */}
        {!reduced && (
          <button type="button" className="ph-redraw" onClick={redraw} title="Redraw the pitch">
            <span aria-hidden>↻</span>
            <span className="sr-only">Redraw the pitch</span>
          </button>
        )}
      </div>
    </div>
  );
}
