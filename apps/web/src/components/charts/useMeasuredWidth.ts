// Live container width — a chart draws TO it rather than scrolling inside it (one SVG
// user unit = one CSS pixel, so type never scales below legibility). Extracted from
// BaselineLadder when MonthlyRecord became its second consumer; the ResizeObserver is the
// fix for the mount-measure bug that squashed the Elo chart (geometry is measured, not
// fixed — and re-measured).
import { useLayoutEffect, useRef, useState } from "react";

export function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(el.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
