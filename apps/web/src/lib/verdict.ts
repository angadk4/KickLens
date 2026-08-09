// The graded card's top-pick verdict — everything the stamp and the card edge need, from
// one call, for BOTH poles.
//
// WHY THIS FILE EXISTS RATHER THAN A TERNARY IN THE PAGE. The verdict has been wrong in
// this repo twice, and both times the bug was ASYMMETRY: a green `.badge.ok` with no red
// twin (T-277), then a `✓ top pick hit` whose `✗` counterpart had never existed in the
// repo's history at all (found 2026-08-02 by `git log -S'✗'`). A ternary invites that —
// you touch the branch you are looking at. Here both poles are built from ONE object
// literal shape, and `verdict.test.ts` asserts they carry identical key sets, identical
// word lengths and identical structure. Making one pole louder than the other now takes a
// deliberate edit that fails a test.
//
// WHAT THE CHANNELS ARE, and which one is load-bearing:
//   · `word`     — HIT / MISS. The CARRIER. Always rendered, always visible.
//   · `label`    — the honest phrase for assistive tech and the tooltip. "Top pick" is the
//                  qualifier that keeps this accurate: it is the outcome we gave the
//                  highest probability to, not a statement that the forecast was "right".
//   · `fillClass`— solid chalk vs outline. The site's existing solid-vs-hollow idiom
//                  (MonthlyRecord's hollow dots, SealStrip's empty→dashed→filled).
//                  Luminance, which skims better than hue and survives colour blindness.
//   · `edgeClass`— a 2px colour stripe on the card's RIGHT edge. An ACCELERATOR only, in
//                  tokens.css's exact sense: it makes the page skimmable and carries no
//                  information the word does not already carry.
//
// Accuracy remains diagnostic-only everywhere it is *reasoned* about (model selection,
// promotion, done-criteria, market claims). That is untouched by rendering it legibly:
// the card still prints log loss beside this, and the rule under the bar still carries the
// continuous truth — a 71% hit and a 34% hit produce the same word and very different bars.

export type Verdict = {
  /** the visible word — short on purpose, so the stamp reads as a block not a sentence */
  word: string;
  /** the accessible name + tooltip text; always names "top pick", never just "hit" */
  label: string;
  /** longer explanation for the title attribute */
  title: string;
  /** solid vs outline stamp */
  fillClass: "hit" | "miss";
  /** the card's right-edge stripe. NOT named `verdict-*`: `.verdict` is already the
      Performance page's Δ chip, and the collision silently restyled this stamp once. */
  edgeClass: "pick-hit" | "pick-miss";
};

const HIT: Verdict = {
  word: "HIT",
  label: "top pick hit",
  title: "Top pick hit: the outcome we gave the highest probability is the one that happened.",
  fillClass: "hit",
  edgeClass: "pick-hit",
};

const MISS: Verdict = {
  word: "MISS",
  label: "top pick missed",
  title:
    "Top pick missed: the outcome we gave the highest probability is not the one that happened.",
  fillClass: "miss",
  edgeClass: "pick-miss",
};

/** The verdict for a graded forecast. Pure function of `correct` and nothing else. */
export function verdictOf(correct: boolean): Verdict {
  return correct ? HIT : MISS;
}
