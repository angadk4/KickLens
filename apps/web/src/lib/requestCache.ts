// Two things the browser's HTTP cache cannot do for us, and on a scale-to-zero backend both of
// them cost whole seconds.
//
// 1. DEDUP. fetch() does not coalesce two concurrent GETs of the same URL. /engineering asks for
//    /activity?hours=48 from BOTH NextRunsBoard and ActivityFeed in one render pass, and the app
//    shell duplicates /matches/upcoming and /predictions/completed with the pages that also want
//    them. Lambda scales by concurrency, so each of those is a SEPARATE container doing its own
//    SSM read, TLS handshake and Neon wake — a path measured at 26.3s cold (BUILD_LOG 2026-07-13).
//    One in-flight promise per URL turns N cold starts into one.
//
// 2. A TIMEOUT. A bare fetch() waits forever. A hung cold start left the skeleton shimmering with
//    no recovery path and no way back except a manual reload.
//
// This sits UNDER api.ts, so every caller gets it without knowing. It does not replace the HTTP
// cache or change how stale anything is allowed to be: TTLs are read from the server's OWN
// Cache-Control response header rather than duplicated here, so this layer cannot drift out of
// agreement with apps/api/main.py's `_cache()`. An endpoint whose max-age changes server-side
// changes here on the next response, with no client edit.

/** Only used when a response arrives with no parseable max-age. Deliberately short. */
const DEFAULT_TTL_MS = 30_000;
/** Generous on purpose: the measured cold path is ~26s, and timing out ON a legitimate cold
    wake would abort the very request that is warming the database. */
const FIRST_ATTEMPT_TIMEOUT_MS = 35_000;
/** The wake is already paid for by the time we retry, so the second try should be quick. */
const RETRY_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = 400;

type Entry = { at: number; ttl: number; data: unknown };

const fresh = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

function parseMaxAge(header: string | null): number | null {
  if (!header) return null;
  const m = /max-age\s*=\s*(\d+)/i.exec(header);
  if (!m) return null;
  const seconds = Number(m[1]);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

/** One attempt, abortable. The timer is one-shot and always cleared (docs/motion.md rule 7). */
async function attempt(url: string, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET with in-flight dedup and a short-lived memory cache.
 *
 * `key` is the API path (stable across BASE changes); `url` is what actually gets fetched.
 * A non-OK response is NOT retried — a 404 is a real answer, not a transport failure. Only a
 * network error or a timeout gets the second attempt.
 */
export async function cachedGet<T>(url: string, key: string): Promise<T> {
  const hit = fresh.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data as T;

  const live = inFlight.get(key);
  if (live) return live as Promise<T>;

  const run = (async (): Promise<T> => {
    let res: Response;
    try {
      res = await attempt(url, FIRST_ATTEMPT_TIMEOUT_MS);
    } catch {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      res = await attempt(url, RETRY_TIMEOUT_MS);
    }
    // Keep the exact message shape useApi parses for its notFound branch ("404 …").
    if (!res.ok) throw new Error(`${res.status} ${key}`);
    const data = (await res.json()) as T;
    fresh.set(key, {
      at: Date.now(),
      ttl: parseMaxAge(res.headers.get("cache-control")) ?? DEFAULT_TTL_MS,
      data,
    });
    return data;
  })();

  const tracked = run.finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, tracked);
  return tracked;
}

/**
 * Warm a URL without caring about the result. Used on nav hover/focus: on a cold path, starting
 * the wake while the pointer is still travelling is worth more than any micro-optimisation.
 * Errors are swallowed — a failed prefetch must never surface as an unhandled rejection.
 */
export function prefetch(url: string, key: string): void {
  if (fresh.has(key) || inFlight.has(key)) return;
  void cachedGet(url, key).catch(() => {});
}

/**
 * Drop every cached body. Called by useApi's `retry` (after an error) and `refresh` (new grades
 * landed) so both still force a real round-trip — without this, a cache hit would make the
 * retry button a no-op and the grade-sync refresh silently return the pre-grade payload.
 * In-flight requests are left alone; they are already fetching.
 */
export function invalidateAll(): void {
  fresh.clear();
}

/** Test seam only. */
export function __resetRequestCache(): void {
  fresh.clear();
  inFlight.clear();
}
