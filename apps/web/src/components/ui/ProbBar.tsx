// H/D/A probability bar — fixed order, 2px gaps, always visible (no JS/animation-gated
// visibility). Labels are adaptive: in-bar when EVERY segment is wide enough, otherwise a
// caption row below — one encoding, never a silently clipped sliver.
import { pct } from "../../lib/format";

const MIN_LABEL_SHARE = 0.14;

export function ProbBar({
  pHome,
  pDraw,
  pAway,
}: {
  pHome: number;
  pDraw: number;
  pAway: number;
}) {
  const segs = [
    { key: "home", label: "H", p: pHome },
    { key: "draw", label: "D", p: pDraw },
    { key: "away", label: "A", p: pAway },
  ] as const;
  const inBar = segs.every((s) => s.p >= MIN_LABEL_SHARE);
  return (
    <div className="probbar-wrap">
      <div
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
