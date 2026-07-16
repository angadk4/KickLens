// A board section: the strap (eyebrow breaking a full-width rule, metadata sitting on
// the rule's right) replaces v4's margin gutter. Same props; optional id for the TOC.
import type { ReactNode } from "react";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function Section({
  eyebrow,
  meta,
  title,
  description,
  children,
  id,
  lead = false,
}: {
  eyebrow?: string;
  /** short mono items sitting on the strap rule — n=, dates, seals (DATA only, no slogans) */
  meta?: ReactNode[];
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** anchor id for the sticky TOC; defaults to slug(eyebrow) */
  id?: string;
  /** the page's lead section speaks in the condensed scoreboard voice; interiors don't */
  lead?: boolean;
}) {
  const anchor = id ?? (eyebrow ? slugify(eyebrow) : undefined);
  return (
    <section className={`entry${lead ? " lead" : ""}`} id={anchor}>
      {(eyebrow || meta) && (
        <header className="entry-strap">
          {eyebrow && <span className="strap-label">{eyebrow}</span>}
          <span className="strap-rule" aria-hidden />
          {meta && (
            <span className="strap-meta">
              {meta.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
            </span>
          )}
        </header>
      )}
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
