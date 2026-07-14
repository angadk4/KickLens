// Loading / empty / error building blocks. Empty states say WHY they're empty and WHEN
// they fill — honest emptiness is part of the brand, never papered over.
import type { ReactNode } from "react";

export function Skeleton({ height = 120 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-hidden />;
}

export function EmptyState({
  big,
  title,
  children,
}: {
  big?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {big && <span className="big">{big}</span>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorState({ retry }: { retry?: () => void }) {
  return (
    <div className="banner error">
      API unreachable — showing nothing rather than something stale without saying so.{" "}
      {retry && (
        <button type="button" onClick={retry} style={{ textDecoration: "underline" }}>
          retry
        </button>
      )}
    </div>
  );
}
