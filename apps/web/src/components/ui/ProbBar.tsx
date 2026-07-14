// H/D/A probability bar v2 — fixed order, 2px gaps, CSS-driven fill animation (deterministic
// everywhere), inline labels only when a segment is wide enough; aria carries the numbers.
import { pct } from "../../lib/format";

export function ProbBar({
  pHome,
  pDraw,
  pAway,
  legend = false,
}: {
  pHome: number;
  pDraw: number;
  pAway: number;
  legend?: boolean;
}) {
  const segs = [
    { key: "home", label: "H", p: pHome },
    { key: "draw", label: "D", p: pDraw },
    { key: "away", label: "A", p: pAway },
  ] as const;
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
            <span className="seg-label">{s.p >= 0.14 && `${s.label} ${pct(s.p)}`}</span>
          </div>
        ))}
      </div>
      {legend && (
        <div className="probbar-legend" aria-hidden>
          <span>
            <span className="swatch" style={{ background: "var(--home)" }} />H home {pct(pHome)}
          </span>
          <span>
            <span className="swatch" style={{ background: "var(--draw)" }} />D draw {pct(pDraw)}
          </span>
          <span>
            <span className="swatch" style={{ background: "var(--away)" }} />A away {pct(pAway)}
          </span>
        </div>
      )}
    </div>
  );
}
