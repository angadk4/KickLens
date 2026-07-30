// TIER 5 — pointer-linked. THE one global writer: one passive listener, one rAF-coalesced
// flush, custom properties on :root, N passive readers. Adding a reader is free; adding a
// second writer is forbidden (docs/motion.md).
//
// Same rAF-coalescing shape as lib/useTilt: a frame is scheduled only by an actual
// pointermove, so there is no persistent loop (rule 7).
//
// The properties are registered with @property in styles/base.css so the engine knows their
// type and can skip re-parsing on every write — and so --pl becomes transitionable, which
// is what lets the lamp fade out when the pointer leaves the window instead of snapping.
let raf = 0;
let lx = 0;
let ly = 0;
let live = 0;
let refs = 0;

function flush(): void {
  raf = 0;
  const s = document.documentElement.style;
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  s.setProperty("--px", (lx / w).toFixed(4)); // 0…1 across the viewport
  s.setProperty("--py", (ly / h).toFixed(4));
  s.setProperty("--pxn", ((lx / w) * 2 - 1).toFixed(4)); // −1…1, for parallax
  s.setProperty("--pyn", ((ly / h) * 2 - 1).toFixed(4));
  s.setProperty("--pl", String(live)); // 0 = no pointer in the window
}

function schedule(): void {
  if (!raf) raf = requestAnimationFrame(flush);
}

function onMove(e: PointerEvent): void {
  lx = e.clientX;
  ly = e.clientY;
  live = 1;
  schedule();
}

function onLeave(): void {
  live = 0;
  schedule();
}

/** Ref-counted singleton: N components may acquire it and there is still ONE listener. */
export function acquirePointerLight(): () => void {
  if (typeof window === "undefined") return () => {};
  refs++;
  if (refs === 1) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave, { passive: true });
    document.addEventListener("pointerleave", onLeave, { passive: true });
  }
  return () => {
    refs = Math.max(0, refs - 1);
    if (refs === 0) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerleave", onLeave);
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      live = 0;
      // hand the lamp back to its initial-value: 0 so nothing is left lit
      document.documentElement.style.removeProperty("--pl");
    }
  };
}
