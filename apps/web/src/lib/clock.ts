// The ONE wall clock. `useNow` used to create a setInterval PER CALL SITE — a loaded home
// page ran ~17 independent timers, each waking the CPU on its own schedule. This registry
// keeps one interval per distinct interval LENGTH (1s while a countdown is live, 30s, 60s),
// shared by every subscriber via useSyncExternalStore, so all consumers tick on the SAME
// wake-up. docs/motion.md rule 7: no new timers — subscribe here instead.
type Bucket = {
  id: ReturnType<typeof setInterval> | null;
  now: number;
  fns: Set<() => void>;
};

const buckets = new Map<number, Bucket>();

/** Buckets are created lazily and NEVER deleted: getSnapshot must return a stable value
    between renders (a fresh Date.now() every call is an infinite render loop). The interval
    starts on first subscribe and stops on last unsubscribe; the cached `now` survives. */
function bucket(ms: number): Bucket {
  let b = buckets.get(ms);
  if (!b) {
    b = { id: null, now: Date.now(), fns: new Set() };
    buckets.set(ms, b);
  }
  return b;
}

export function subscribeClock(ms: number, fn: () => void): () => void {
  const b = bucket(ms);
  b.fns.add(fn);
  if (b.id === null) {
    // a fresh subscription gets a fresh baseline, so a bucket idle for an hour doesn't
    // serve everyone an hour-stale "now" until its first tick
    b.now = Date.now();
    b.id = setInterval(() => {
      b.now = Date.now();
      for (const f of b.fns) f();
    }, ms);
  }
  return () => {
    b.fns.delete(fn);
    if (b.fns.size === 0 && b.id !== null) {
      clearInterval(b.id);
      b.id = null;
    }
  };
}

export function clockNow(ms: number): number {
  return bucket(ms).now;
}
