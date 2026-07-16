// Forecast-state badges: FROZEN (official, immutable) vs PRELIMINARY (draft) is a
// first-class honesty distinction — never render probabilities without one.
// Labels stay SHORT so meta rows never wrap; the explanation rides in `title`.
type Kind = "frozen" | "draft" | "voided" | "none" | "ok";

const LABELS: Record<Kind, string> = {
  frozen: "⬡ FROZEN",
  draft: "◌ PRELIMINARY",
  voided: "✕ VOIDED",
  none: "no forecast yet",
  ok: "✓",
};

export function Badge({
  kind,
  label,
  title,
}: {
  kind: Kind;
  label?: string;
  title?: string;
}) {
  return (
    <span className={`badge ${kind}`} title={title}>
      {label ?? LABELS[kind]}
    </span>
  );
}
