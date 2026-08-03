// The top-pick verdict stamp: a filled chalk block for a hit, the same block as an outline
// for a miss. Both poles identical in box, position and type — only the fill differs, which
// is the site's established solid-vs-hollow idiom (MonthlyRecord's hollow dots, SealStrip's
// empty→dashed→filled, ⬡ vs · in FieldLedger).
//
// The visible word is short so the stamp reads as a BLOCK at skim distance; the honest
// phrase ("top pick hit") is the accessible name and the tooltip, so nothing is lost for a
// screen reader or on hover. See lib/verdict.ts for why both poles come from one shape.
import { verdictOf } from "../../lib/verdict";

export function Verdict({ correct }: { correct: boolean }) {
  const v = verdictOf(correct);
  return (
    <span className={`pick-stamp ${v.fillClass}`} title={v.title}>
      {/* aria-hidden on the short word, the full phrase in an sr-only twin: a screen
          reader should hear "top pick missed", not the letters M-I-S-S */}
      <span aria-hidden>{v.word}</span>
      <span className="sr-only">{v.label}</span>
    </span>
  );
}
