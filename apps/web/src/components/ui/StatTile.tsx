// KPI tile. `scope` and `n` are REQUIRED (T-171): no metric ever renders without its
// evidence scope and sample size. Pass n=null only for non-metric counts (e.g. fixtures).
import type { ReactNode } from "react";
import type { Scope } from "../../api";
import { CountUp } from "./CountUp";
import { ScopeChip } from "./ScopeChip";

export function StatTile({
  label,
  value,
  format,
  scope,
  n,
  sub,
}: {
  label: string;
  value: number | string;
  format?: (v: number) => string;
  scope: Scope | "none";
  n: number | null;
  sub?: ReactNode;
}) {
  return (
    <div className="stat-tile">
      <span className="label">{label}</span>
      <span className="value">
        {typeof value === "number" ? (
          <CountUp value={value} format={format ?? ((v) => v.toFixed(0))} />
        ) : (
          value
        )}
      </span>
      {scope !== "none" && <ScopeChip scope={scope} n={n} />}
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}
