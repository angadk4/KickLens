// Forecast-state badges: FROZEN (official, immutable) vs PRELIMINARY (draft) is a
// first-class honesty distinction — never render probabilities without one.
type Kind = "frozen" | "draft" | "voided" | "none" | "ok";

const LABELS: Record<Kind, string> = {
  frozen: "⬡ FROZEN",
  draft: "◌ PRELIMINARY",
  voided: "✕ VOIDED",
  none: "no forecast yet",
  ok: "✓",
};

export function Badge({ kind, label }: { kind: Kind; label?: string }) {
  return <span className={`badge ${kind}`}>{label ?? LABELS[kind]}</span>;
}
