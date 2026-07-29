// The raw strap-entry shell for sections whose label is DATA (a match day, a scope) rather
// than copy — the same .entry wrapper Section renders, with the same scroll settle, for
// call sites that hand-roll their own strap. Keeps the reveal wiring in ONE place.
import type { ReactNode } from "react";
import { useSettle } from "../../lib/reveal";

export function Entry({ children }: { children: ReactNode }) {
  const ref = useSettle<HTMLDivElement>();
  return (
    <div ref={ref} className="entry">
      {children}
    </div>
  );
}
