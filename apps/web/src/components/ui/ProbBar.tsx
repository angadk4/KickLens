// H/D/A probability bar — fixed order, 2px gaps, always visible (no JS/animation-gated
// visibility). Labels are PIXEL-aware: in-bar only when every segment can fit its label
// at the bar's measured width, otherwise a caption row below — one encoding, never a
// silently clipped sliver (a share-based gate clips on narrow cards).
import { useEffect, useRef, useState } from "react";
import { pct } from "../../lib/format";

const MIN_LABEL_PX = 62; // ≈ "D 26.0%" at 11px mono + breathing room

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
  const inBar = width > 0 && segs.every((s) => s.p * width >= MIN_LABEL_PX);
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
          >
            <span className="seg-label">{inBar && `${s.label} ${pct(s.p)}`}</span>
          </div>
        ))}
      </div>
      {!inBar && (
        <div className="probbar-legend" aria-hidden>
          {segs.map((s) => (
            <span key={s.key}>
              <span className="swatch" style={{ background: `var(--${s.key})` }} />
              {s.label} {pct(s.p)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
