// Scroll reveal, done so it can't lie: elements are FULLY VISIBLE by default — no JS, no
// IntersectionObserver, no class → nothing was ever hidden (the opacity:0-stuck regression
// of BUILD_LOG:873 is impossible by construction). ONE module-level observer serves the
// whole app, unobserving each element after it fires, so steady-state cost is zero.
import { useEffect, useRef } from "react";

export type RevealDecision = "settle" | "skip" | "wait";

/** The policy, pure and unit-testable. `first` = is this the element's first observation?
    With `skipIfInitiallyVisible`, an element already on screen at mount NEVER animates —
    no page-load flash, nothing added to first paint, and late-arriving data doesn't pop.
    "Scroll reveal" then means exactly what it says: it only fires on actual scrolling.
    CountUp passes false — a count-up on first sight is its entire point. */
export function inViewDecision(
  first: boolean,
  isIntersecting: boolean,
  skipIfInitiallyVisible: boolean,
): RevealDecision {
  if (!isIntersecting) return "wait";
  return first && skipIfInitiallyVisible ? "skip" : "settle";
}

type Watched = { fire: (d: "settle" | "skip") => void; first: boolean; skipInitial: boolean };

let io: IntersectionObserver | null = null;
const watched = new Map<Element, Watched>();

function ensureObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const w = watched.get(e.target);
        if (!w) continue;
        const d = inViewDecision(w.first, e.isIntersecting, w.skipInitial);
        w.first = false;
        if (d === "wait") continue;
        io?.unobserve(e.target);
        watched.delete(e.target);
        w.fire(d);
      }
    },
    // fire a little before the element's top clears the fold, so the settle is underway
    // as the eye arrives rather than starting after it
    { rootMargin: "0px 0px -10% 0px" },
  );
  return io;
}

/** Watch `el` until it first scrolls into view, then fire exactly once and stop watching.
    Fires "skip" when the element was already visible at mount (unless skipIfInitiallyVisible
    is false) and immediately when IntersectionObserver doesn't exist — callers must render
    their final state on "skip". Returns an unsubscribe. */
export function onFirstInView(
  el: Element,
  fire: (d: "settle" | "skip") => void,
  { skipIfInitiallyVisible = true }: { skipIfInitiallyVisible?: boolean } = {},
): () => void {
  const obs = ensureObserver();
  if (!obs) {
    fire("skip"); // no observer, no theatrics: final state, immediately
    return () => {};
  }
  watched.set(el, { fire, first: true, skipInitial: skipIfInitiallyVisible });
  obs.observe(el);
  return () => {
    obs.unobserve(el);
    watched.delete(el);
  };
}

/** Ref hook: adds `cls` when the element first scrolls into view. The class only ADDS
    motion (a from-only keyframe, no fill-mode) — delete the animation and nothing breaks.
    The effect-time reduced-motion read is a spare-the-work optimization; the live guarantee
    is the CSS killswitch in base.css, which zeroes the animation mid-flight regardless. */
export function useSettle<T extends Element>(cls = "settled"): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    return onFirstInView(el, (d) => {
      if (d === "settle") el.classList.add(cls);
    });
  }, [cls]);
  return ref;
}
