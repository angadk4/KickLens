// Elo trajectories: up to four COMPARED teams drawn boldly over the rest of the league as a
// faint band. Click any band line to add it; the table below is the same control.
//
// It used to be a 5/12 sticky rail (~480px wide) plotting thirty undifferentiated lines with
// no legend and no labels, and the developer's verdict was "way too small… so confusing". All
// three of those were separate defects and all three are fixed here: it is full width and
// twice as tall, at most four lines carry colour and a direct end-of-line label, and the
// tooltip lists those four instead of all thirty in series order.
//
// THE LAG was none of the above. `onMouseMove` called `setLabelPos` on every pointer sample,
// which re-rendered the figure, which rebuilt thirty <Line> elements, which made Recharts
// recompute thirty ~250-point paths — so the chart visibly trailed the cursor. The floating
// label is now positioned by a direct style write on a ref; `hoverId` remains state but only
// changes on enter/leave. (CSS-driven emphasis via .recharts-line-curve was considered and
// rejected: it couples this file to Recharts' internal class names for no further gain once
// the per-frame render is gone.)
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TeamRating } from "../../api";
import { type Slot, slotOf } from "../../lib/compareSlots";
import { teamName, teamShort } from "../../lib/format";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { C, MONO, SERIES, axisProps, gridProps } from "./theme";

/** Elo's starting rating. Every team begins here, so it is the line that makes "1712" mean
    something rather than being a number with no zero. */
const INIT_RATING = 1500;
/** Below this measured plot width an end label would eat a fifth of the chart; the compare
    tray carries the mapping there instead. */
const LABEL_MIN_W = 560;
const RIGHT_LABELLED = 76;
/* not 12: the final x tick is centred on the last category, so a tight right margin clips
   its label in half at 390px — measured, then set to clear "Jul 26 '26" */
const RIGHT_BARE = 34;

const fmtDate = (d: string) =>
  `${new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  })} '${d.slice(2, 4)}`;

function EloTooltip({
  active,
  payload,
  label,
  byId,
  slots,
  comparedIds,
  hoverId,
}: {
  active?: boolean;
  payload?: readonly { name?: string; value?: number; dataKey?: string | number }[];
  label?: string | number;
  byId: Map<number, TeamRating>;
  slots: Slot[];
  comparedIds: Set<number>;
  hoverId: number | null;
}) {
  if (!active || !payload?.length) return null;
  // The shared ChartTooltip lists EVERY series. Unfiltered that is thirty rows in arbitrary
  // series order, with the team you actually care about somewhere in the middle — the single
  // worst element on the old page. Show the compare set plus whatever is hovered, ranked.
  const keep = payload
    .filter((e) => {
      const id = Number(String(e.dataKey ?? "").slice(1));
      return comparedIds.has(id) || id === hoverId;
    })
    .filter((e) => typeof e.value === "number")
    .slice()
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  if (!keep.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{fmtDate(String(label))}</strong>
      {keep.map((e) => {
        const id = Number(String(e.dataKey ?? "").slice(1));
        const t = byId.get(id);
        const slot = slotOf(slots, id);
        return (
          <span key={id} className="tt-row">
            <i
              className="tt-swatch"
              style={{ background: slot >= 0 ? SERIES[slot] : C.ink }}
              aria-hidden
            />
            {t ? teamName(t.team) : ""} {e.value?.toFixed(1)}
            {t?.provisional ? " · provisional" : ""}
          </span>
        );
      })}
    </div>
  );
}

export function EloHistory({
  teams,
  slots,
  onPick,
}: {
  teams: TeamRating[];
  slots: Slot[];
  onPick: (teamId: number) => void;
}) {
  const [hoverId, setHoverId] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const canHover = useMediaQuery("(hover: hover)");

  // MEASURED, NOT RESPONSIVE — and this is a bug fix, not a preference. With
  // <ResponsiveContainer width="100%">, Recharts measured the container once at mount, laid
  // the chart out for ~200px, and then never re-measured because the container never actually
  // resized: the plot sat squashed into the left sixth of a 1208px box until some unrelated
  // re-render (a health poll, ~3s later) happened to force a relayout. Measuring the wrapper
  // ourselves and passing explicit numbers makes the geometry deterministic and single-source
  // — the same lesson BaselineLadder's header already records for its hand-rolled SVG.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- ONE pass over the histories, replacing a union-of-dates map that re-scanned every
  // team's whole history for every date (~7,500 .filter() calls, each allocating an array).
  const view = useMemo(() => {
    const dateSet = new Set<string>();
    let lo = INIT_RATING;
    let hi = INIT_RATING;
    for (const t of teams) {
      for (const p of t.history ?? []) {
        dateSet.add(p.date);
        // reduce, not Math.min(...ratings): a 1,200-argument spread is a needless hazard
        if (p.rating < lo) lo = p.rating;
        if (p.rating > hi) hi = p.rating;
      }
    }
    const dates = [...dateSet].sort();
    const dateIdx = new Map(dates.map((d, i) => [d, i]));
    const rows: Record<string, string | number | null>[] = dates.map((date) => ({ date }));
    const lastIdx = new Map<number, number>();
    const span = new Map<number, [number, number]>();

    for (const t of teams) {
      const h = t.history ?? [];
      if (!h.length) continue;
      const key = `t${t.team_id}`;
      let first = Infinity;
      let last = -1;
      for (const p of h) {
        const i = dateIdx.get(p.date);
        if (i === undefined) continue;
        rows[i]![key] = p.rating;
        if (i < first) first = i;
        if (i > last) last = i;
      }
      if (last < 0) continue;
      // forward-fill ONLY between a team's first and last rated match. Outside that span the
      // value stays null, so `connectNulls` cannot invent a rating for a team before it had
      // one — the bug a naive full-width fill would introduce.
      let cur: number | null = null;
      for (let i = first; i <= last; i++) {
        const v = rows[i]![key];
        if (typeof v === "number") cur = v;
        else rows[i]![key] = cur;
      }
      lastIdx.set(t.team_id, last);
      span.set(t.team_id, [first, last]);
    }

    const yLo = Math.floor(lo / 50) * 50;
    const yHi = Math.ceil(hi / 50) * 50;
    return {
      dates,
      rows,
      lastIdx,
      span,
      yLo,
      yHi,
      yTicks: Array.from({ length: (yHi - yLo) / 50 + 1 }, (_, i) => yLo + i * 50),
    };
  }, [teams]);

  const byId = useMemo(() => new Map(teams.map((t) => [t.team_id, t])), [teams]);
  const compared = useMemo(
    () =>
      slots
        .map((s, slot) => (s ? { slot, team: byId.get(s.id) } : null))
        .filter((x): x is { slot: number; team: TeamRating } => !!x?.team),
    [slots, byId],
  );
  const comparedIds = new Set(compared.map((c) => c.team.team_id));
  const labelled = size.w >= LABEL_MIN_W;

  if (!view.dates.length) return null;

  const hovered = hoverId !== null ? byId.get(hoverId) : undefined;

  // end-of-line labels, pushed apart so two teams within a few Elo points stay readable
  const endY = new Map<number, number>();

  return (
    <figure className="chart-figure">
      <div
        ref={wrapRef}
        className="elo-wrap"
        role="img"
        aria-label={
          (compared.length
            ? `Elo trajectories. Compared: ${compared.map((c) => teamName(c.team.team)).join(", ")}. `
            : "Elo trajectories, none selected. ") +
          `${teams.length - compared.length} other teams are drawn faintly for context. ` +
          `Window: the last 40 rated matches per team. The ranking table below lists every team's current rating, form and change.`
        }
        onMouseMove={(e) => {
          // direct DOM write — no state, so this costs one style assignment per sample
          const el = labelRef.current;
          const wrap = wrapRef.current;
          if (!el || !wrap || hoverId === null) return;
          const r = wrap.getBoundingClientRect();
          el.style.transform = `translate(${e.clientX - r.left + 10}px, ${e.clientY - r.top}px) translateY(-50%)`;
        }}
        onMouseLeave={() => setHoverId(null)}
      >
        {/* the wrapper holds its own height in CSS, so nothing shifts before the first
            measurement lands */}
        {size.w > 0 && (
          <LineChart
            width={size.w}
            height={size.h}
            data={view.rows}
            margin={{ right: labelled ? RIGHT_LABELLED : RIGHT_BARE, top: 8 }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} minTickGap={56} tickFormatter={fmtDate} />
            <YAxis domain={[view.yLo, view.yHi]} ticks={view.yTicks} {...axisProps} />
            {/* every team starts at 1500, so this is the chart's zero */}
            <ReferenceLine
              y={INIT_RATING}
              stroke="rgba(232, 237, 230, 0.4)"
              strokeDasharray="5 4"
              label={{
                value: `${INIT_RATING} · Elo start`,
                position: "insideTopLeft",
                fill: C.faint,
                fontSize: 11,
                fontFamily: MONO,
              }}
            />
            {/* element form, like every other chart here — Recharts' function ContentType
                wants a readonly payload and a wider label type than we care about */}
            <Tooltip
              cursor={{ stroke: C.lineStrong, strokeWidth: 1 }}
              content={
                <EloTooltip
                  byId={byId}
                  slots={slots}
                  comparedIds={comparedIds}
                  hoverId={hoverId}
                />
              }
            />
            {/* the league band. Deliberately below the 3:1 graphics floor (0.30 of C.gray
                composites to ~1.5:1) — it is CONTEXT, and it must never be the only place a
                fact lives: every team's rating, form and delta are in the table below. Do not
                "fix" the alpha; that would flatten the figure/ground the compare set needs. */}
            {teams
              .filter((t) => !comparedIds.has(t.team_id))
              .map((t) => (
                <Line
                  key={t.team_id}
                  dataKey={`t${t.team_id}`}
                  name={teamName(t.team)}
                  stroke={t.team_id === hoverId ? C.ink : C.gray}
                  strokeOpacity={t.team_id === hoverId ? 0.9 : 0.3}
                  strokeWidth={t.team_id === hoverId ? 2 : 1}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  onMouseEnter={() => setHoverId(t.team_id)}
                  onClick={() => onPick(t.team_id)}
                  style={{ cursor: "pointer" }}
                />
              ))}
            {compared.map(({ slot, team }) => (
              <Line
                key={team.team_id}
                dataKey={`t${team.team_id}`}
                name={teamName(team.team)}
                stroke={SERIES[slot]}
                strokeWidth={slot === 0 ? 2.5 : 2}
                /* dash is spent on DATA, not identity: a provisional team has fewer than ten
                   rated matches, so its line swings hardest and most needs the caveat drawn
                   on it. Identity is carried by colour, the end label and the tray chip. */
                strokeDasharray={team.provisional ? "5 4" : undefined}
                dot={false}
                connectNulls
                isAnimationActive={false}
                onClick={() => onPick(team.team_id)}
                style={{ cursor: "pointer" }}
              >
                {labelled && (
                  <LabelList
                    dataKey={`t${team.team_id}`}
                    content={(props: {
                      index?: number;
                      x?: number | string;
                      y?: number | string;
                    }) => {
                      // an empty fragment, not null: Recharts' LabelContentType has no null
                      if (props.index !== view.lastIdx.get(team.team_id)) return <></>;
                      const px = Number(props.x);
                      const py = Number(props.y);
                      if (!Number.isFinite(px) || !Number.isFinite(py)) return <></>;
                      // nudge apart when two ends land within 14px of each other
                      let y = py;
                      for (const [, other] of endY) {
                        if (Math.abs(other - y) < 14) y = other + 14;
                      }
                      endY.set(team.team_id, y);
                      return (
                        <text
                          x={px + 6}
                          y={y}
                          fill={SERIES[slot]}
                          fontFamily={MONO}
                          fontSize={11}
                          textAnchor="start"
                          dominantBaseline="middle"
                        >
                          {teamShort(team.team)} {team.rating.toFixed(0)}
                        </text>
                      );
                    }}
                  />
                )}
              </Line>
            ))}
          </LineChart>
        )}
        {/* one node, moved by transform; hidden until a band line is hovered */}
        <span
          ref={labelRef}
          className="elo-label"
          style={{ visibility: hovered ? "visible" : "hidden" }}
        >
          {hovered ? `${teamName(hovered.team)} · ${hovered.rating.toFixed(1)}` : ""}
        </span>
      </div>
      <figcaption>
        {compared.length
          ? `${compared.map((c) => teamName(c.team.team)).join(" · ")} over the league.`
          : "No team selected. Pick a row below to plot its trajectory."}{" "}
        The last 40 rated matches per team (about 1.2 seasons; 40 is the API's maximum), one
        point per completed regular-season match.{" "}
        <strong>A flat stretch means that team did not play</strong>; the axis is calendar
        date, so a rating holds its last value until the next match rather than being missing.{" "}
        {canHover
          ? "Hover a faint line to name it; click it, or a table row, to compare it."
          : "Tap a faint line, or a table row, to compare it."}
      </figcaption>
      <details>
        <summary>View the trajectory as a table</summary>
        {/* the chart's OWN numbers — the ranking table below already has current rating, form
            and Δ last 5, so duplicating it here would be a second copy 40px away */}
        <table className="data-table">
          <thead>
            <tr>
              <th>Team</th>
              <th className="num">Window start</th>
              <th className="num">Window end</th>
              <th className="num">Δ over window</th>
              <th className="num">Points</th>
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
                  <td>
                    {teamName(t.team)}
                    {t.provisional ? " (provisional)" : ""}
                  </td>
                  <td className="num">{first ? first.rating.toFixed(1) : "—"}</td>
                  <td className="num">{last ? last.rating.toFixed(1) : "—"}</td>
                  <td className="num">
                    {d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}`}
                  </td>
                  <td className="num">{h.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
