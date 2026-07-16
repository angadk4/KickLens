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
  // nice y-axis: multiples of 50 covering the data
  const ratings = teams.flatMap((t) => (t.history ?? []).map((p) => p.rating));
  const yLo = Math.floor(Math.min(...ratings, 1500) / 50) * 50;
  const yHi = Math.ceil(Math.max(...ratings, 1500) / 50) * 50;
  const yTicks = Array.from({ length: (yHi - yLo) / 50 + 1 }, (_, i) => yLo + i * 50);
  return (
    <figure className="chart-figure">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ right: 28 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="date"
            {...axisProps}
            minTickGap={56}
            tickFormatter={(d: string) => `${d.slice(5)} '${d.slice(2, 4)}`}
          />
          <YAxis domain={[yLo, yHi]} ticks={yTicks} {...axisProps} />
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
            stroke={C.model}
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
