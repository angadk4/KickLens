// A ledger entry: the gutter marker is the margin column (label + metadata lines,
// like a ledger's date/folio column) beside the entry body. No entrance animation —
// a ledger page doesn't fade in; content paints instantly.
import type { ReactNode } from "react";

export function Section({
  eyebrow,
  meta,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  /** short mono lines hung under the gutter label — dates, n=, seals */
  meta?: ReactNode[];
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="entry">
      <div className="entry-marker">
        {eyebrow}
        {meta?.map((m, i) => (
          <span key={i} className="em-meta">
            {m}
          </span>
        ))}
      </div>
      <div className="entry-body">
        <div className="section-head">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
