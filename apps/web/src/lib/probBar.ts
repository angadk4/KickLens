// The H/D/A bar's geometry, and the mark that says WHICH outcome happened.
//
// This replaced the goal mark (a 132×40 goal mouth with the ball at p(actual)). The metaphor
// was the loud complaint, but the real defect was that the card carried two charts 40px apart
// on two DIFFERENT x-axes — the bar's axis is outcome share, the mark's was probability of one
// outcome — to plot a number the bar above already contained as a segment width.
//
// So the mark moved onto the bar: a rule exactly as wide as the segment that happened. Its
// WIDTH is the probability, on the bar's own scale, which is why it is a rule and not a caret
// or a tick or an arrow. It degrades honestly (a 9px rule is a truthful depiction of 2%) and
// it cannot be mistaken for a verdict glyph.
//
// THE HONESTY RULE, and the reason this file exists rather than the logic living in the
// component: everything the mark renders is a pure function of `result` ALONE. Permute the
// probabilities so the actual outcome goes from top pick to bottom pick and every rendered
// attribute except the rule's width is identical. There is no threshold, no "hit" state, and
// no channel through which correctness could be expressed — which is a stronger guarantee than
// the goal mark's guardrails gave (they set the celebration bar high; this removes the bar).
// `probBar.test.ts` asserts exactly that, including at the source level.
import { pct } from "./format";

export type Outcome = "H" | "D" | "A";

export type Seg = {
  key: "home" | "draw" | "away";
  label: Outcome;
  p: number;
  /** flex-grow. Floored so a 0% outcome still occupies a hairline rather than collapsing. */
  grow: number;
};

const RESULT_WORD: Record<Outcome, string> = {
  H: "home win",
  D: "draw",
  A: "away win",
};

/** The three cells, in the fixed H|D|A order used everywhere on the site. */
export function segments(pHome: number, pDraw: number, pAway: number): Seg[] {
  return [
    { key: "home", label: "H", p: pHome },
    { key: "draw", label: "D", p: pDraw },
    { key: "away", label: "A", p: pAway },
  ].map((s) => ({ ...s, grow: Math.max(s.p, 0.001) })) as Seg[];
}

/** Which cell the result names. */
export function markedIndex(result: Outcome): number {
  return result === "H" ? 0 : result === "D" ? 1 : 2;
}

/** p(actual): the probability the frozen forecast gave to what actually happened.
    Kept from lib/goalMark.ts, where it was tested against the identity that makes the whole
    card coherent — the grade stores log_loss = −ln p, so p = e^−log_loss. That identity is
    what lets the rule print the FROZEN probability while the chip beside it prints the GRADED
    number, and have both be the same claim. */
export function pActual(
  probs: { p_home: number; p_draw: number; p_away: number },
  result: Outcome,
): number {
  return result === "H" ? probs.p_home : result === "D" ? probs.p_draw : probs.p_away;
}

/** Everything the outcome mark renders, from one call.
    Returned together ON PURPOSE: the rule's width and the caption's number are then the same
    value by construction, so the card cannot print a figure the bar contradicts, and the mark
    row's flex weights are literally the bar's own. Two functions could drift; one cannot. */
export function outcomeMark(
  pHome: number,
  pDraw: number,
  pAway: number,
  result: Outcome,
): {
  cells: Seg[];
  index: number;
  p: number;
  caption: string;
} {
  const cells = segments(pHome, pDraw, pAway);
  const index = markedIndex(result);
  const cell = cells[index]!;
  // NOTE there is no colour in this return. The rule takes its colour from the marked cell's
  // own key class (.oc-cell.away .oc-rule), the same way the segment above takes its fill —
  // so the component writes no per-card style at all beyond the flex weights it shares with
  // the bar, and there is nowhere for a correctness signal to be smuggled in.
  return {
    cells,
    index,
    p: cell.p,
    // one template, both render sites — the same "one label rule, everywhere" discipline the
    // bar's own in-segment labels already follow
    caption: `result: ${RESULT_WORD[result]} · forecast gave ${pct(cell.p)}`,
  };
}
