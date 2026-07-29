// A card's held-back line — data the card already computed but used to throw away
// (seal time, brier, prediction id). ALWAYS in the DOM: screen readers and touch users
// get it permanently; only fine-pointer hover/focus fades it in (.card-detail CSS), and
// its slot is reserved with min-height so revealing never reflows the grid.
import type { ReactNode } from "react";

export function CardDetail({ children }: { children: ReactNode }) {
  return <span className="card-detail">{children}</span>;
}
