// Fetch-once data hook. Deliberately NO polling anywhere (Neon scale-to-zero: the browser
// cache + Cache-Control headers do the work). `retry` is for explicit user action only.
import { useCallback, useEffect, useState } from "react";

export type ApiState<T> = {
  data: T | null;
  error: boolean;
  notFound: boolean;
  loading: boolean;
  retry: () => void;
};

export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

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
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, notFound, loading, retry };
}
