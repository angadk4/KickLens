// Scroll-settle around a SMALLER host than a whole <Section>.
//
// The reveal policy in lib/reveal.ts is right — an element visible at mount never animates,
// which is what prevents both the load flash and the opacity:0-stuck regression. The
// GRANULARITY was wrong: /record and /ratings each wrap their entire page in one <Section>
// whose top is above the fold, so one skip decision killed every reveal on the page. This
// wrapper puts the observer on the thing that is actually below the fold.
import type { ElementType, ReactNode } from "react";
import { useSettle } from "../../lib/reveal";

export function Reveal({
  as: As = "div",
  className,
  children,
}: {
  /** the element to render — use the tag the layout already expects */
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  const ref = useSettle<HTMLElement>();
  return (
    <As ref={ref} className={className}>
      {children}
    </As>
  );
}
