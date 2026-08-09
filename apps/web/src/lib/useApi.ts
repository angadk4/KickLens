// Fetch-once data hook. Deliberately NO polling anywhere (Neon scale-to-zero: the browser
// cache + Cache-Control headers do the work). `retry` is for explicit user action only;
// `refresh` is the SILENT programmatic refetch — it must never raise `retrying`, or a
// routine background refresh renders a false "API unreachable" banner.
//
// Dedup and timeouts live one layer down in lib/requestCache, so this hook stays a thin
// state machine. Both `retry` and `refresh` must bust that cache first: a cache hit would
// otherwise make the retry button a no-op and hand the grade-sync refresh its own stale payload.
import { useCallback, useEffect, useRef, useState } from "react";
import { invalidateAll } from "./requestCache";

export type ApiState<T> = {
  data: T | null;
  error: boolean;
  notFound: boolean;
  loading: boolean;
  /** a USER-triggered retry is in flight — the error banner stays up (busy, not blank)
      instead of vanishing into a skeleton and reappearing seconds later on a cold start */
  retrying: boolean;
  retry: () => void;
  /** programmatic refetch (new grades landed, etc.) — no banner, no retrying state */
  refresh: () => void;
};

export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  // true only between a retry() click and that request settling — the retrying flag's gate
  const userRetry = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    setNotFound(false);
    fn()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof Error && e.message.startsWith("404")) setNotFound(true);
        else setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
        // Reset OUTSIDE the alive guard. When deps changed mid-retry this stayed true, so the
        // NEXT load rendered as "retrying" — an error banner in busy state over a healthy fetch.
        userRetry.current = false;
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const retry = useCallback(() => {
    userRetry.current = true;
    invalidateAll();
    setTick((t) => t + 1);
  }, []);
  const refresh = useCallback(() => {
    invalidateAll();
    setTick((t) => t + 1);
  }, []);
  return { data, error, notFound, loading, retrying: loading && userRetry.current, retry, refresh };
}
