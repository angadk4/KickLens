// One-shot count-up for stat values; renders the final value immediately under reduced
// motion, when IntersectionObserver is missing, or if the element never scrolls into view
// before unmount. startOnView (default): the count begins on FIRST SIGHT — a below-the-fold
// tile must not finish counting before anyone arrives (lib/reveal.ts, opposite policy to
// scroll-settle: visible-at-mount elements DO count, that's the whole point).
// Reduced motion via useMediaQuery, NOT framer's useReducedMotion — framer 12's hook reads
// once at mount and never updates (verified in its source), so it can't stop a JS count
// started after the user flips the OS setting.
import { animate } from "framer-motion";
import { useEffect, useRef } from "react";
import { onFirstInView } from "../../lib/reveal";
import { useMediaQuery } from "../../lib/useMediaQuery";

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
    let controls: ReturnType<typeof animate> | null = null;
    const run = () => {
      // count from the PREVIOUS value, not from zero: on an increment (23 → 24) restarting
      // at zero reads as a slot machine rather than a number ticking up.
      controls = animate(fromRef.current ?? 0, value, {
        duration: 0.8,
        ease: [0.16, 1, 0.3, 1],
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
