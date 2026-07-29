// Forecast-state badges: FROZEN (official, immutable) vs PRELIMINARY (draft) is a
// first-class honesty distinction — never render probabilities without one.
// Labels stay SHORT so meta rows never wrap; the explanation rides in `title`.
// "ok" (green ✓) is gone on purpose: graded cards render hit AND miss neutral — the
// goal mark carries the continuous p(actual) instead of a coloured verdict.
type Kind = "frozen" | "draft" | "voided" | "none";

const LABELS: Record<Kind, string> = {
  frozen: "⬡ FROZEN",
  draft: "◌ PRELIMINARY",
  voided: "✕ VOIDED",
  none: "no forecast yet",
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
