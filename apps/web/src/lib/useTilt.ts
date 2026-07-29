// Pointer tilt for the four home board cards — 4 is a signature, 30 is a gimmick.
// rAF-coalesced (one measurement per frame, no persistent loop — docs/motion.md rule 7),
// transient will-change (set on enter, cleared on leave — rule 4), and OFF entirely for
// coarse pointers and reduced motion. The killswitch can't zero a JS-set transform, so
// the reduced-motion check lives here — via useMediaQuery, which genuinely subscribes
// (framer 12's useReducedMotion reads once at mount and never updates).
import { useCallback, useRef } from "react";
import { useMediaQuery } from "./useMediaQuery";

const MAX_DEG = 3; // keep in step with --tilt-max: more softens the mono numerals

export function useTilt<T extends HTMLElement>() {
  const frame = useRef(0);
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const active = finePointer && !reduced;

  const onPointerEnter = useCallback(
    (e: React.PointerEvent<T>) => {
      if (!active) return;
      e.currentTarget.style.willChange = "transform";
    },
    [active],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      if (!active) return;
      const el = e.currentTarget;
      const { clientX, clientY } = e;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const px = (clientX - r.left) / r.width - 0.5; // −0.5 … 0.5 across the card
        const py = (clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--tilt-x", `${(py * -2 * MAX_DEG).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${(px * 2 * MAX_DEG).toFixed(2)}deg`);
      });
    },
    [active],
  );

  const onPointerLeave = useCallback((e: React.PointerEvent<T>) => {
    cancelAnimationFrame(frame.current);
    const el = e.currentTarget;
    el.style.removeProperty("--tilt-x");
    el.style.removeProperty("--tilt-y");
    el.style.willChange = "";
  }, []);

  return { onPointerEnter, onPointerMove, onPointerLeave };
}
