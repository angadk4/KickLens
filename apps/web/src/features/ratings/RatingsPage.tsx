// Elo power rankings — computed by replaying every completed RS match through the SAME
// engine that feeds the model (ADR-001 draws included). Not an opinion; a byproduct.
//
// Layout, 2026-07-31: chart on TOP at full shell width, table below. It used to be a 5/12
// sticky rail beside the table (~480px of plot) and the verdict was "way too small… so
// confusing". The rail's job was to keep the trajectory beside whatever row you were reading;
// full-width-on-top cannot do that, so the replacement is the compare tray plus a coloured
// left edge on every compared row — the row's edge IS its line's colour, at every viewport.
import { useState } from "react";
import { api } from "../../api";
import { EloHistory } from "../../components/charts/EloHistory";
import { SERIES, MAX_COMPARE } from "../../components/charts/theme";
import { Reveal } from "../../components/ui/Reveal";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import {
  idsOf,
  isCompared,
  isDefault,
  pruneSlots,
  slotOf,
  slotsFrom,
  toggleSlot,
  type Slot,
} from "../../lib/compareSlots";
import { compactInt, dateShort, teamName } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useMediaQuery } from "../../lib/useMediaQuery";

/** Three, not four: the empty fourth slot is the invitation. "3 of 4 compared" teaches both
    the ceiling and the action in one line, which no amount of instructional copy does. */
const DEFAULT_COMPARE = 3;

function FormStr({ form }: { form: string }) {
  return (
    <span className="form-str">
      {form.split("").map((c, i) => (
        <span key={i} className={c.toLowerCase()}>
          {c}
        </span>
      ))}
    </span>
  );
}

export function RatingsPage() {
  const { data, error, notFound, loading, retrying, retry } = useApi(() => api.ratings(40));
  const [picked, setPicked] = useState<Slot[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // live-subscribing hook, not a render-time matchMedia read (unsafe + never updates)
  const canHover = useMediaQuery("(hover: hover)");

  const teams = data?.teams ?? [];
  // The top three by rating, pre-selected. Three coloured lines on arrival make the compare
  // mechanic self-evident with no instruction, and they answer the page's first question —
  // who is actually best — with the same rows the eye already lands on.
  const defaults = teams.slice(0, DEFAULT_COMPARE).map((t) => t.team_id);
  // Derived in render, never written from an effect: a refetch must not shuffle the reader's
  // comparison, so surviving teams keep their slots and vanished ones simply free theirs.
  const live = new Set(teams.map((t) => t.team_id));
  const slots = pruneSlots(picked ?? slotsFrom(defaults, MAX_COMPARE), live);
  const comparedCount = idsOf(slots).length;

  const pick = (id: number) => {
    const r = toggleSlot(slots, id);
    setPicked(r.slots);
    const name = teams.find((t) => t.team_id === id);
    setAnnouncement(
      r.evicted !== null
        ? `${teamName(name?.team ?? "")} replaced ${teamName(
            teams.find((t) => t.team_id === r.evicted)?.team ?? "",
          )} in the comparison.`
        : isCompared(slots, id)
          ? `${teamName(name?.team ?? "")} removed from the comparison.`
          : `${teamName(name?.team ?? "")} added to the comparison.`,
    );
  };

  return (
    <div className="page">
      <Section
        lead
        eyebrow="Power ratings"
        // generated_at_utc has always been sent and never shown: a replay's timestamp is
        // exactly the sort of provenance this site is supposed to surface
        meta={[
          data?.generated_at_utc ? `replayed ${dateShort(data.generated_at_utc)}` : "replayed on demand",
          "model inputs",
        ]}
        title={`Elo ratings${data?.season ? ` — ${data.season} season` : ""}`}
        description={
          data
            ? `Chronological Elo replay (K=20, home advantage 60, margin-of-victory
               multiplier; draws move ratings) — the same engine that feeds the model's
               Elo-difference feature. Replayed over ${compactInt(data.n_rated_matches)}
               completed regular-season matches since 2012${data.as_of_utc ? `, as of ${dateShort(data.as_of_utc)}` : ""}.`
            : "Replay of the model's own rating engine over every completed regular-season match."
        }
      >
        {loading && !retrying && (
          /* matches the chart's own clamp, or its arrival shifts the whole page down */
          <Skeleton height={420} ball label="replaying every rated match…" />
        )}
        {(error || retrying) && (
          <ErrorState retry={retry} retrying={retrying} what="the ratings" />
        )}
        {notFound && (
          <EmptyState title="Ratings are not available yet">
            The ratings endpoint publishes with the next API deploy — nothing is shown that
            can't be backed by data.
          </EmptyState>
        )}
        {data && teams.length === 0 && (
          <EmptyState title="No rated matches yet">
            Ratings appear once completed regular-season matches exist.
          </EmptyState>
        )}
        {data && teams.length > 0 && (
          <div className="ratings-stack">
            {/* the chart is rendered even with an EMPTY compare set — gating it on a selection
                would collapse the page height the moment you deselected everything */}
            <div className="ratings-chart">
              <div className="compare-tray" role="group" aria-label="Teams compared">
                {slots.map((s, slot) =>
                  s ? (
                    <button
                      key={s.id}
                      type="button"
                      className="compare-chip"
                      style={{ ["--slot-color" as string]: SERIES[slot] }}
                      onClick={() => pick(s.id)}
                    >
                      <i className="swatch" aria-hidden />
                      {teamName(teams.find((t) => t.team_id === s.id)?.team ?? "")}
                      <span aria-hidden>×</span>
                      <span className="sr-only">remove from comparison</span>
                    </button>
                  ) : null,
                )}
                <span className="compare-count">
                  {comparedCount} of {MAX_COMPARE} compared
                </span>
                {!isDefault(slots, defaults) && (
                  <button
                    type="button"
                    className="compare-reset"
                    onClick={() => {
                      setPicked(slotsFrom(defaults, MAX_COMPARE));
                      setAnnouncement(`Comparison reset to the top ${DEFAULT_COMPARE} teams.`);
                    }}
                  >
                    Reset to top {DEFAULT_COMPARE}
                  </button>
                )}
              </div>
              {/* picking a fifth team evicts the oldest, which is invisible without this —
                  and the control is reachable by keyboard, so it must be announced */}
              <span className="sr-only" role="status" aria-live="polite">
                {announcement}
              </span>
              <EloHistory teams={teams} slots={slots} onPick={pick} />
              <p className="blurb">
                Ratings are inputs to the forecast model, not predictions themselves.
              </p>
            </div>

            <div style={{ display: "grid", gap: "var(--space-3)", minWidth: 0 }}>
              <p className="blurb">
                Select any row to add it to the comparison — up to {MAX_COMPARE} teams, each
                with its own colour on the chart above
                {canHover ? ", or click a faint line to name and add it." : "."}{" "}
                {teams.some((t) => t.provisional) &&
                  '"Provisional" = fewer than 10 career matches rated, drawn dashed above. '}
                Δ last 5 includes any start-of-season regression inside the window.
              </p>
              {/* the server describes its own method; printing it verbatim beats the hardcoded
                  paraphrase that used to sit above (and could silently drift from the engine) */}
              <p className="blurb" style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)" }}>
                {data.method}
              </p>
              {/* Reveal on the table, not the page's single above-the-fold <Section>: that
                  skip decision meant this page could never animate anything. Now that the
                  table sits below the chart it is genuinely below the fold, so it fires. */}
              <Reveal className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>Team</th>
                      <th className="num">Rating</th>
                      <th className="num">Δ last 5</th>
                      <th>Form</th>
                      <th className="num">Played</th>
                      <th className="hide-sm">Last match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t) => {
                      const slot = slotOf(slots, t.team_id);
                      return (
                        /* row click stays as a convenience for pointer users; the BUTTON in the
                           team cell is the real control — a bare <tr onClick> is unreachable by
                           keyboard, and role="button" on a <tr> would destroy its cell semantics */
                        <tr
                          key={t.team_id}
                          onClick={() => pick(t.team_id)}
                          className={slot >= 0 ? "row-compared" : undefined}
                          style={
                            slot >= 0
                              ? ({ ["--slot-color" as string]: SERIES[slot] } as React.CSSProperties)
                              : undefined
                          }
                        >
                          <td className="num">{t.rank}</td>
                          <td>
                            <button
                              type="button"
                              className="row-pick"
                              aria-pressed={slot >= 0}
                              onClick={(e) => {
                                e.stopPropagation(); // one selection event, not two
                                pick(t.team_id);
                              }}
                            >
                              {/* the swatch rides INSIDE the button so it survives
                                  .table-scroll's horizontal scroll, where the row's left
                                  edge can be scrolled out of view */}
                              {slot >= 0 && <i className="rp-swatch" aria-hidden />}
                              {teamName(t.team)}
                            </button>
                            {t.provisional && (
                              <span className="chip" style={{ marginLeft: 8 }}>
                                provisional
                              </span>
                            )}
                          </td>
                          <td className="num">{t.rating.toFixed(1)}</td>
                          <td className="num">
                            {t.delta_5 === null ? (
                              "—"
                            ) : (
                              <span className={t.delta_5 >= 0 ? "delta-up" : "delta-down"}>
                                {t.delta_5 >= 0 ? "+" : ""}
                                {t.delta_5.toFixed(1)}
                              </span>
                            )}
                          </td>
                          <td>
                            <FormStr form={t.form} />
                          </td>
                          <td className="num">{t.played_season}</td>
                          <td className="num hide-sm">{dateShort(t.last_match_utc)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Reveal>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
