// Measure a chart wrapper's width ourselves instead of trusting <ResponsiveContainer
// width="100%">.
//
// This is the same bug EloHistory documents inline and fixed the same way: Recharts measures
// the container once at mount, lays the chart out for a stale/near-zero width, and then never
// re-measures — because the container never actually resizes. The chart sat squashed until
// some UNRELATED re-render happened to force a relayout.
//
// That accidental rescue is exactly what the 2026-08-09 performance pass removed. Taking
// `useNow()` out of UpcomingContext stopped the provider re-rendering every consumer once a
// minute, and with it went the stray relayout that had been quietly hiding this on /calibration
// and /performance. Measured on a cold throttled mobile load: the chart drew collapsed for
// ~480ms before something else nudged it.
//
// So: measure the wrapper, pass explicit numbers, render nothing until we have a real width.
// The wrapper still reserves the full height, so there is no reflow either way — only the
// difference between a correct chart and a visibly wrong one.
import { useEffect, useRef, useState } from "react";

export function useChartWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") {
      // no observer in this environment: the one-shot read above is still correct at mount,
      // and a resize simply keeps the last good width rather than collapsing
      return;
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
