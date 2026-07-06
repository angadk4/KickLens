export function ProbBar({
  pHome,
  pDraw,
  pAway,
}: {
  pHome: number;
  pDraw: number;
  pAway: number;
}) {
  const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
  return (
    <div className="probbar" role="img" aria-label={`home ${pct(pHome)}, draw ${pct(pDraw)}, away ${pct(pAway)}`}>
      <div className="seg home" style={{ width: pct(pHome) }}>
        H {pct(pHome)}
      </div>
      <div className="seg draw" style={{ width: pct(pDraw) }}>
        D {pct(pDraw)}
      </div>
      <div className="seg away" style={{ width: pct(pAway) }}>
        A {pct(pAway)}
      </div>
    </div>
  );
}
