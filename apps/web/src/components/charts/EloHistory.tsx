// Elo trajectory: selected team in accent over the league band in faint gray.
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TeamRating } from "../../api";
import { ChartTooltip } from "./ChartTooltip";
import { C, axisProps, gridProps } from "./theme";

export function EloHistory({
  teams,
  selectedId,
}: {
  teams: TeamRating[];
  selectedId: number;
}) {
  // union of dates across teams → one row per date, one column per team id
  const dates = Array.from(
    new Set(teams.flatMap((t) => (t.history ?? []).map((p) => p.date))),
  ).sort();
  if (!dates.length) return null;
  const data = dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const t of teams) {
      const pt = (t.history ?? []).filter((p) => p.date <= date).at(-1);
      row[`t${t.team_id}`] = pt ? pt.rating : null;
    }
    return row;
  });
  const selected = teams.find((t) => t.team_id === selectedId);
  return (
    <figure className="chart-figure">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ right: 12 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} minTickGap={48} />
          <YAxis domain={["auto", "auto"]} {...axisProps} />
          <Tooltip content={<ChartTooltip format={(v) => v.toFixed(1)} />} />
          {teams
            .filter((t) => t.team_id !== selectedId)
            .map((t) => (
              <Line
                key={t.team_id}
                dataKey={`t${t.team_id}`}
                name={t.team}
                stroke={C.gray}
                strokeOpacity={0.25}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          <Line
            dataKey={`t${selectedId}`}
            name={selected?.team ?? "selected"}
            stroke={C.accent}
            strokeWidth={2.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <figcaption>
        {selected?.team ?? "Selected team"} Elo trajectory vs the rest of the league (faint).
      </figcaption>
    </figure>
  );
}
