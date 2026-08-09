// One-shot count-up for stat values; renders the final value immediately under reduced
// motion, when IntersectionObserver is missing, or if the element never scrolls into view
// before unmount. startOnView (default): the count begins on FIRST SIGHT — a below-the-fold
// tile must not finish counting before anyone arrives (lib/reveal.ts, opposite policy to
// scroll-settle: visible-at-mount elements DO count, that's the whole point).
// Reduced motion via useMediaQuery, NOT a library hook — framer 12's useReducedMotion read
// once at mount and never updated, so it could not stop a JS count started after the user
// flipped the OS setting. That reasoning is why lib/tween.ts could replace framer-motion here
// with no behaviour change: this file never used framer's reduced-motion or layout machinery,
// only its number tween. Same duration, same control points.
import { useEffect, useRef } from "react";
import { onFirstInView } from "../../lib/reveal";
import { cubicBezier, tween, type TweenControls } from "../../lib/tween";
import { useMediaQuery } from "../../lib/useMediaQuery";

/** The site's settle curve, unchanged from the framer call this replaced. */
const EASE = cubicBezier(0.16, 1, 0.3, 1);

export function CountUp({
  value,
  format,
  startOnView = true,
}: {
  value: number;
  format: (v: number) => string;
  startOnView?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatRef = useRef(format);
  formatRef.current = format; // latest formatter without re-triggering the animation
  const fromRef = useRef<number | null>(null); // where the last count ended
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Write the CURRENT final value up front. On a value change React's commit may be
    // reverted by the outgoing effect's teardown ordering — this line, not the cleanup,
    // is what guarantees the DOM never shows a superseded number while offscreen.
    el.textContent = formatRef.current(value);
    if (reduced) return;
    let controls: TweenControls | null = null;
    const run = () => {
      // count from the PREVIOUS value, not from zero: on an increment (23 → 24) restarting
      // at zero reads as a slot machine rather than a number ticking up.
      controls = tween({
        from: fromRef.current ?? 0,
        to: value,
        durationMs: 800,
        ease: EASE,
        onUpdate: (v) => {
          el.textContent = formatRef.current(v);
        },
      });
      fromRef.current = value;
    };
    let off: (() => void) | null = null;
    if (startOnView) {
      // "skip" = no IntersectionObserver in this environment → final value already set
      off = onFirstInView(el, (d) => {
        if (d === "settle") run();
      }, { skipIfInitiallyVisible: false });
    } else {
      run();
    }
    return () => {
      off?.();
      controls?.stop(); // never leave a half-counted number ticking; the next effect's
      // up-front write (above) owns the DOM from here
    };
  }, [value, reduced, startOnView]);

  return <span ref={ref}>{format(value)}</span>;
}
