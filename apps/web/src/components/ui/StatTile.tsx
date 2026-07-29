// KPI tile. `scope` and `n` are REQUIRED (T-171): no metric ever renders without its
// evidence scope and sample size. Pass n=null only for non-metric counts (e.g. fixtures).
import type { ReactNode } from "react";
import type { Scope } from "../../api";
import { countInt } from "../../lib/format";
import { CountUp } from "./CountUp";
import { ScopeChip } from "./ScopeChip";

export function StatTile({
  label,
  value,
  format,
  scope,
  n,
  sub,
  detail,
}: {
  label: string;
  value: number | string;
  format?: (v: number) => string;
  scope: Scope | "none";
  n: number | null;
  sub?: ReactNode;
  /** held-back companion figures from the SAME scope payload (T-171-safe: they inherit
      the tile's scope chip + n) — revealed on hover, always present for SR/touch */
  detail?: ReactNode;
}) {
  return (
    <div className="stat-tile">
      <span className="label">{label}</span>
      <span className="value">
        {typeof value === "number" ? (
          <CountUp value={value} format={format ?? countInt} />
        ) : (
          value
        )}
      </span>
      {scope !== "none" && <ScopeChip scope={scope} n={n} />}
      {sub && <span className="sub">{sub}</span>}
      {detail && <span className="card-detail">{detail}</span>}
    </div>
  );
}
