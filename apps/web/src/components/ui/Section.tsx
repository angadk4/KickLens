// Page section with eyebrow/title/description. Entrance is PURE CSS (fade + rise with
// `both` fill): content visibility must never depend on a JS animation frame running.
import type { ReactNode } from "react";

export function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section-enter" style={{ display: "grid", gap: "var(--space-4)" }}>
      <div className="section-head">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}
