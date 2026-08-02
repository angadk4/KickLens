// The palette's open signal — the liveFeed.ts module-emitter idiom, for the same reason:
// the nav's ⌘K keycap must be able to open a palette that lives in a different leaf of the
// tree without a context re-rendering every page between them.
type Listener = () => void;

const listeners = new Set<Listener>();

export function openPalette(): void {
  for (const fn of listeners) fn();
}

export function onOpenPalette(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
