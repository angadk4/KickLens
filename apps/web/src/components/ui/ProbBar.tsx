// H/D/A probability bar — fixed order, 2px gaps, always visible (no JS/animation-gated
// visibility). ONE label rule, everywhere: the outcome letter + the probability at ONE
// decimal, in the bar, at every viewport and every segment width. The published number IS
// the record, so it must read identically on a 390px phone and a 1440px desktop — a bar
// that swaps precision (or swaps to a legend row) by measured width made the SAME forecast
// render "57.9%" on one screen and "58%" on another, and put two treatments side by side in
// one card grid. Width now decides only whether a LABEL is drawn, never how a NUMBER reads:
// a segment too narrow to hold its label in full renders no label rather than a clipped
// sliver (the aria-label always carries all three figures).
//
// On a GRADED card the bar also carries the outcome mark: pass `result` and a rule appears
// beneath, exactly as wide as the segment that happened, in that outcome's own colour. It
// replaced a separate goal-mouth graphic that plotted the same number 40px lower on a
// different x-axis. The colour says WHICH outcome occurred, never whether we were right — a
// 12% away win and a 71% away win are both clay and differ only in length. See lib/probBar.ts.
import { memo, useEffect, useRef, useState } from "react";
import { pct } from "../../lib/format";
import { outcomeMark, segments, type Outcome } from "../../lib/probBar";
import { observeWidth } from "../../lib/sharedResize";

/** A label is exactly 7 monospace glyphs ("D 26.0%") = 50.4px at --text-xs IBM Plex Mono
    600 (measured, not estimated); +8px so it never sets flush against a segment edge. */
const LABEL_PX = 58;

function ProbBarImpl({
  pHome,
  pDraw,
  pAway,
  result,
}: {
  pHome: number;
  pDraw: number;
  pAway: number;
  /** graded cards only: the outcome that actually happened */
  result?: Outcome;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    // ONE shared observer for every bar on the page (lib/sharedResize): /record renders 50 of
    // these, and an observer each meant 50 callbacks and a whole second commit of the grid
    return observeWidth(el, setWidth);
  }, []);

  // ONE source for the cells. The mark row below renders from the same array, so its rules
  // cannot drift off the segments they sit under — no measuring, no second ResizeObserver.
  const mark = result ? outcomeMark(pHome, pDraw, pAway, result) : null;
  const segs = mark ? mark.cells : segments(pHome, pDraw, pAway);

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
            style={{ flexGrow: s.grow, flexBasis: 0 }}
            title={`${s.label} ${pct(s.p)}`}
          >
            {/* one precision, one place: in-bar, 1dp — drawn only when it fits whole */}
            {width > 0 && s.p * width >= LABEL_PX && (
              <span className="seg-label">{`${s.label} ${pct(s.p)}`}</span>
            )}
          </div>
        ))}
      </div>
      {mark && (
        <div className="probbar-outcome">
          {/* aria-hidden: the rule restates the segment above it, and the caption below is
              real text — so both render sites are announced without a bespoke aria sentence */}
          <div className="probbar-marks" aria-hidden>
            {segs.map((s, i) => (
              <div
                key={s.key}
                className={`oc-cell ${s.key}`}
                style={{ flexGrow: s.grow, flexBasis: 0 }}
              >
                {/* colour comes from the cell's own class, exactly as the segment above gets
                    its fill — so the component writes no per-card style beyond the shared
                    flex weights, and there is nowhere for a correctness signal to live */}
                {i === mark.index && <div className="oc-rule" />}
              </div>
            ))}
          </div>
          <span className="probbar-caption">{mark.caption}</span>
        </div>
      )}
    </div>
  );
}

// memo: props are three numbers and an optional outcome letter, so the comparison is trivial
// and there are 50 instances on /record. Anything that re-renders the grid (a parent state
// change, a navigation) now stops at the bar instead of re-rendering every segment.
export const ProbBar = memo(ProbBarImpl);
