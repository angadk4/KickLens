// H/D/A probability bar — fixed order, 2px gaps, always visible (no JS/animation-gated
// visibility). ONE label rule, everywhere: the outcome letter + the probability at ONE
// decimal, in the bar, at every viewport and every segment width. The published number IS
// the record, so it must read identically on a 390px phone and a 1440px desktop — a bar
// that swaps precision (or swaps to a legend row) by measured width made the SAME forecast
// render "57.9%" on one screen and "58%" on another, and put two treatments side by side in
// one card grid. Width now decides only whether a LABEL is drawn, never how a NUMBER reads:
// a segment too narrow to hold its label in full renders no label rather than a clipped
// sliver (the aria-label always carries all three figures).
import { useEffect, useRef, useState } from "react";
import { pct } from "../../lib/format";

/** A label is exactly 7 monospace glyphs ("D 26.0%") = 50.4px at --text-xs IBM Plex Mono
    600 (measured, not estimated); +8px so it never sets flush against a segment edge. */
const LABEL_PX = 58;

export function ProbBar({
  pHome,
  pDraw,
  pAway,
}: {
  pHome: number;
  pDraw: number;
  pAway: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const segs = [
    { key: "home", label: "H", p: pHome },
    { key: "draw", label: "D", p: pDraw },
    { key: "away", label: "A", p: pAway },
  ] as const;

  return (
    <div className="probbar-wrap">
      <div
        ref={barRef}
        className="probbar"
        role="img"
        aria-label={`Home ${pct(pHome)}, draw ${pct(pDraw)}, away ${pct(pAway)}`}
      >
        {segs.map((s) => (
          <div
            key={s.key}
            className={`seg ${s.key}`}
            style={{ flexGrow: Math.max(s.p, 0.001), flexBasis: 0 }}
            title={`${s.label} ${pct(s.p)}`}
          >
            {/* one precision, one place: in-bar, 1dp — drawn only when it fits whole */}
            {width > 0 && s.p * width >= LABEL_PX && (
              <span className="seg-label">{`${s.label} ${pct(s.p)}`}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
