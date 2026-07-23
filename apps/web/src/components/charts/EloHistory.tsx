// Elo trajectory: selected team in chalk over the league band in faint gray.
// Hover ANY line to preview it (chalk stroke + floating label); click a table row to pin.
// Perf: one hoverId string state; only the two affected lines change stroke per hover.
import { useMemo, useRef, useState } from "react";
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
import { teamName } from "../../lib/format";
import { ChartTooltip } from "./ChartTooltip";
import { C, axisProps, gridProps } from "./theme";

export function EloHistory({
  teams,
  selectedId,
}: {
  teams: TeamRating[];
  selectedId: number;
}) {
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [labelPos, setLabelPos] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // union of dates across teams → one row per date, one column per team id
  const dates = useMemo(
    () =>
      Array.from(new Set(teams.flatMap((t) => (t.history ?? []).map((p) => p.date)))).sort(),
    [teams],
  );
  const data = useMemo(
    () =>
      dates.map((date) => {
        const row: Record<string, string | number | null> = { date };
        for (const t of teams) {
          const pt = (t.history ?? []).filter((p) => p.date <= date).at(-1);
          row[`t${t.team_id}`] = pt ? pt.rating : null;
        }
        return row;
      }),
    [dates, teams],
  );

  const selected = teams.find((t) => t.team_id === selectedId);
  const hovered = hoverId !== null ? teams.find((t) => t.team_id === hoverId) : undefined;

  // nice y-axis: multiples of 50 covering the data
  const { yLo, yHi, yTicks } = useMemo(() => {
    const ratings = teams.flatMap((t) => (t.history ?? []).map((p) => p.rating));
    const lo = Math.floor(Math.min(...ratings, 1500) / 50) * 50;
    const hi = Math.ceil(Math.max(...ratings, 1500) / 50) * 50;
    return {
      yLo: lo,
      yHi: hi,
      yTicks: Array.from({ length: (hi - lo) / 50 + 1 }, (_, i) => lo + i * 50),
    };
  }, [teams]);

  if (!dates.length) return null;

  return (
    <figure className="chart-figure">
      <div
        ref={wrapRef}
        className="elo-wrap"
        role="img"
        aria-label={`Elo rating trajectories for ${teams.length} teams across ${dates.length} match dates, ${
          selected ? teamName(selected.team) : "the selected team"
        } highlighted — the table below lists each team's current rating and change over the window.`}
        onMouseMove={(e) => {
          if (hoverId === null || !wrapRef.current) return;
          const r = wrapRef.current.getBoundingClientRect();
          setLabelPos({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onMouseLeave={() => {
          setHoverId(null);
          setLabelPos(null);
        }}
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ right: 40 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="date"
              {...axisProps}
              minTickGap={56}
              tickFormatter={(d: string) =>
                `${new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                  month: "short",
                  day: "numeric",
                })} '${d.slice(2, 4)}`
              }
            />
            <YAxis domain={[yLo, yHi]} ticks={yTicks} {...axisProps} />
            <Tooltip content={<ChartTooltip format={(v) => v.toFixed(1)} />} />
            {teams
              .filter((t) => t.team_id !== selectedId)
              .map((t) => (
                <Line
                  key={t.team_id}
                  dataKey={`t${t.team_id}`}
                  name={teamName(t.team)}
                  stroke={t.team_id === hoverId ? C.ink : C.gray}
                  strokeOpacity={t.team_id === hoverId ? 0.9 : 0.25}
                  strokeWidth={t.team_id === hoverId ? 2 : 1}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  onMouseEnter={() => setHoverId(t.team_id)}
                />
              ))}
            <Line
              dataKey={`t${selectedId}`}
              name={selected ? teamName(selected.team) : "selected"}
              stroke={C.model}
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {hovered && labelPos && (
          <span className="elo-label" style={{ left: labelPos.x, top: labelPos.y }}>
            {teamName(hovered.team)} · {hovered.rating.toFixed(1)}
          </span>
        )}
      </div>
      <figcaption>
        {selected ? teamName(selected.team) : "Selected team"} Elo trajectory vs the rest of
        the league (faint) —{" "}
        {typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches
          ? "hover any line to preview, select a row to pin."
          : "select a row in the table to change the highlighted team."}
      </figcaption>
      <details>
        <summary>View as table</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Team</th>
              <th className="num">Rating</th>
              <th className="num">Δ over window</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const h = t.history ?? [];
              const first = h[0];
              const last = h.at(-1);
              const d = first && last && h.length > 1 ? last.rating - first.rating : null;
              return (
                <tr key={t.team_id}>
                  <td>{teamName(t.team)}</td>
                  <td className="num">{t.rating.toFixed(1)}</td>
                  <td className="num">
                    {d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
