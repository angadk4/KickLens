// Evidence-scope chip (T-171): scope + sample size, ALWAYS together, label always printed.
import type { Scope } from "../../api";

export function ScopeChip({ scope, n }: { scope: Scope; n: number | null }) {
  return (
    <span className={`chip scope-chip ${scope}`}>
      {scope}
      {n !== null && ` · n=${n.toLocaleString()}`}
    </span>
  );
}
