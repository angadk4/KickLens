// Shared dark tooltip for Recharts.
type Entry = { name?: string; value?: number | string; color?: string };

export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  format?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label !== undefined && <strong>{label}</strong>}
      {payload.map((e, i) => (
        <span key={i}>
          {e.name}:{" "}
          {typeof e.value === "number" && format ? format(e.value) : String(e.value ?? "")}
        </span>
      ))}
    </div>
  );
}
