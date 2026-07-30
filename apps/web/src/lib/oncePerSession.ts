// A read that never mutates, plus an explicit mark — split so a double-invoked render
// cannot make a component see the mark its own first pass wrote.
//
// This exists because PitchHero did read-then-write inside one useMemo. React StrictMode
// double-invokes the factory: pass 1 wrote the flag, pass 2 read it back and returned
// "already drawn", so the site's one orchestrated moment SELF-SUPPRESSED on every dev
// reload — the developer never saw it. The rule this file encodes: reads in render,
// writes in effects.
function safe(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null; // Safari private mode throws on access, not just on write
  }
}

/** Pure read — safe to call twice. No storage ⇒ true (render the FINISHED state; a
    missing storage must never leave an animation permanently armed or half-played). */
export function seenThisSession(
  key: string,
  store: Pick<Storage, "getItem"> | null = safe(),
): boolean {
  if (!store) return true; // no storage at all ⇒ finished state, same as a throw
  try {
    return store.getItem(key) === "1";
  } catch {
    return true;
  }
}

/** The write. Call from an effect, never during render. Idempotent under double-invoke. */
export function markSeen(key: string, store: Pick<Storage, "setItem"> | null = safe()): void {
  try {
    store?.setItem(key, "1");
  } catch {
    /* private mode: the moment simply replays next visit — harmless */
  }
}
