// A stadium scoreboard numeral. Each digit is a column holding a 0-9 strip that is
// TRANSLATED to the right cell; the transform is written during render, so the digit is
// correct with zero animation and the CSS transition is the only motion. That is what
// makes reduced motion free: base.css's `!important transition-duration` beats the inline
// --flap-dur, so digits snap to their final value with no JS involved.
//
// Layout can never move: .flap-col is a fixed em box with overflow:hidden, and every host
// already carries tabular-nums (base.css), so all ten glyphs share one advance.
//
// Accessibility: the columns are aria-hidden (a screen reader must not read 30 numerals per
// digit); one .sr-only sibling carries the value.
import { useEffect, useRef } from "react";
import { flapDigits, flapPlan } from "../../lib/flap";

const CELLS = "0123456789".split("");

export function FlapNumber({
  value,
  pad = 2,
  label,
}: {
  value: number;
  /** minimum column count */
  pad?: number;
  /** what the number means, for screen readers ("days", "in play") */
  label?: string;
}) {
  const digits = flapDigits(value, pad);
  const prevRef = useRef<string | null>(null);
  // Read during render, and it is safe: `prev` only chooses a DURATION — the digit itself
  // comes from props, so the worst possible failure is a slightly-wrong duration, never a
  // wrong number. (CountUp.tsx reads a ref during render for the same reason.)
  const plan = flapPlan(prevRef.current, digits);
  useEffect(() => {
    prevRef.current = digits; // committed after paint ⇒ stable under StrictMode
  }, [digits]);

  return (
    <span className="flap">
      <span className="sr-only">{label ? `${digits} ${label}` : digits}</span>
      {plan.map((c, i) => (
        <span
          key={i}
          className="flap-col"
          aria-hidden
          style={{
            ["--d" as string]: c.digit,
            ["--flap-dur" as string]: `${c.durMs}ms`,
          }}
        >
          <span className="flap-strip">
            {CELLS.map((d) => (
              <span key={d} className="flap-cell">
                {d}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
