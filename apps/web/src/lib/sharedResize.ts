// ONE ResizeObserver for every element that wants its width, in the same shape as
// lib/reveal.ts's single shared IntersectionObserver.
//
// ProbBar created one observer per instance. /record renders 50 of them, so first paint was
// followed by 50 separate observer callbacks each setting state — 50 layout reads and an entire
// second commit of the card grid, immediately after the page appeared. One observer batches all
// of them into a single callback and therefore a single React commit.
//
// The browser delivers ResizeObserver callbacks before paint, so this changes when the work
// happens, never whether the measurement is correct.

type Cb = (width: number) => void;

let observer: ResizeObserver | null = null;
const callbacks = new WeakMap<Element, Cb>();

function ensure(): ResizeObserver | null {
  if (typeof ResizeObserver === "undefined") return null;
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      callbacks.get(entry.target)?.(entry.contentRect.width);
    }
  });
  return observer;
}

/**
 * Observe `el`'s width. Returns an unobserve function.
 *
 * Falls back to a single synchronous read where ResizeObserver is unavailable — the element
 * still gets a correct initial width, it just will not track later resizes.
 */
export function observeWidth(el: Element, cb: Cb): () => void {
  const ro = ensure();
  if (!ro) {
    cb(el.getBoundingClientRect().width);
    return () => {};
  }
  callbacks.set(el, cb);
  ro.observe(el);
  return () => {
    callbacks.delete(el);
    ro.unobserve(el);
  };
}
