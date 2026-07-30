// "What would you have said?" — the visitor's own forecast, scored honestly.
//
// THE HONESTY LIVES HERE, NOT IN THE COPY. Every user-facing figure goes through
// describeCall(), which cannot return a comparison without also returning the sample-size
// caveat and the scope note. That way no call site can print a visitor's number beside the
// model's without both — a mistake that, if it ever shipped, would let a screenshot imply a
// visitor's guess is part of the track record. That is the one failure mode here that would
// actually damage the project, so it is closed at the type level rather than by review.
//
// Sum-to-one is STRUCTURAL: the control is two cuts in [0,1], so the three probabilities are
// differences and always total exactly 1. No normalising, no rounding drift, no deciding which
// outcome to steal from.
export const MIN_P = 0.01;
/** ln(3) — the log loss of guessing ⅓/⅓/⅓ every match */
export const BASELINE_LOG_LOSS = Math.log(3);
/** the site's standard small-sample floor, matching MIN_N_BUCKET_DETAIL */
export const NOISE_N = 30;

export type Split = { pH: number; pD: number; pA: number };
export type Outcome = "H" | "D" | "A";

/** Order the two cuts and keep every outcome above MIN_P. −ln(0) is infinite, and "0%" is a
    claim nobody should make by accident — the clamp is itself part of the lesson. */
export function clampCuts(a: number, b: number): [number, number] {
  const lo = Math.min(Math.max(Math.min(a, b), MIN_P), 1 - 2 * MIN_P);
  const hi = Math.min(Math.max(Math.max(a, b), lo + MIN_P), 1 - MIN_P);
  return [lo, hi];
}

/** Two cuts → a split that sums to exactly 1 by construction. */
export function splitFromCuts(a: number, b: number): Split {
  const [lo, hi] = clampCuts(a, b);
  return { pH: lo, pD: hi - lo, pA: 1 - hi };
}

export function logLoss(s: Split, r: Outcome): number {
  return -Math.log(r === "H" ? s.pH : r === "D" ? s.pD : s.pA);
}

/** What you would score for EACH possible outcome — shown while dragging, so the trade-off is
    felt before the answer is known. This is the whole pedagogy of a proper scoring rule. */
export function conditionalLosses(s: Split): { outcome: Outcome; label: string; loss: number }[] {
  return [
    { outcome: "H", label: "home win", loss: logLoss(s, "H") },
    { outcome: "D", label: "draw", loss: logLoss(s, "D") },
    { outcome: "A", label: "away win", loss: logLoss(s, "A") },
  ];
}

export type CallVerdict = {
  yours: string;
  model: string;
  baseline: string;
  verdict: string;
  /** MANDATORY on every render — the firewall, in the data rather than the markup */
  scopeNote: string;
};

export function describeCall(args: {
  yours: Split;
  model: Split;
  result: Outcome;
  n: number;
}): CallVerdict {
  const y = logLoss(args.yours, args.result);
  const m = logLoss(args.model, args.result);
  const d = Math.abs(y - m).toFixed(4);
  const who = y < m ? "You beat the model" : y > m ? "The model beat you" : "You tied the model";
  const matches = args.n === 1 ? "this one match" : `these ${args.n} matches`;
  const caveat =
    args.n < NOISE_N
      ? ` On ${args.n === 1 ? "one match" : `${args.n} matches`} that is noise — an edge, if it` +
        ` exists, is only visible over hundreds.`
      : "";
  return {
    yours: y.toFixed(4),
    model: m.toFixed(4),
    baseline: BASELINE_LOG_LOSS.toFixed(4),
    verdict: `${who} by ${d} nats on ${matches}.${caveat}`,
    scopeNote:
      "your call · computed in this browser only · never sent to the server · not part of the record",
  };
}
