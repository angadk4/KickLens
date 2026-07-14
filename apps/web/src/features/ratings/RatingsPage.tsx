// Elo power rankings — computed by replaying every completed RS match through the SAME
// engine that feeds the model (ADR-001 draws included). Not an opinion; a byproduct.
import { useState } from "react";
import { api } from "../../api";
import { EloHistory } from "../../components/charts/EloHistory";
import { Section } from "../../components/ui/Section";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";
import { compactInt, dateShort } from "../../lib/format";
import { useApi } from "../../lib/useApi";

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
  const { data, error, notFound, loading, retry } = useApi(() => api.ratings(40));
  const [selected, setSelected] = useState<number | null>(null);
  const selectedId = selected ?? data?.teams[0]?.team_id ?? null;

  return (
    <div className="page">
      <Section
        eyebrow="Power ratings"
        title={`Elo ratings${data?.season ? ` — ${data.season} season` : ""}`}
        description={
          data
            ? `${data.method}. Replayed over ${compactInt(data.n_rated_matches)} completed
               regular-season matches${data.as_of_utc ? `, as of ${dateShort(data.as_of_utc)}` : ""}.`
            : "Replay of the model's own rating engine over every completed regular-season match."
        }
      >
        {loading && <Skeleton height={300} />}
        {error && <ErrorState retry={retry} />}
        {notFound && (
          <EmptyState title="Ratings are not available yet">
            The ratings endpoint publishes with the next API deploy — nothing is shown that
            can't be backed by data.
          </EmptyState>
        )}
        {data && data.teams.length === 0 && (
          <EmptyState title="No rated matches yet">
            Ratings appear once completed regular-season matches exist.
          </EmptyState>
        )}
        {data && data.teams.length > 0 && (
          <>
            {selectedId !== null && <EloHistory teams={data.teams} selectedId={selectedId} />}
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Team</th>
                    <th>Rating</th>
                    <th>Δ last 5</th>
                    <th>Form</th>
                    <th>Played</th>
                    <th>Last match</th>
                  </tr>
                </thead>
                <tbody>
                  {data.teams.map((t) => (
                    <tr
                      key={t.team_id}
                      onClick={() => setSelected(t.team_id)}
                      style={{
                        cursor: "pointer",
                        background:
                          t.team_id === selectedId ? "var(--bg-2)" : undefined,
                      }}
                    >
                      <td className="num">{t.rank}</td>
                      <td>
                        {t.team}
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
                      <td className="num">{dateShort(t.last_match_utc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="blurb">
              Click a team to highlight its trajectory. "Provisional" = fewer than 10 career
              matches rated. Ratings are inputs to the forecast model, not predictions
              themselves.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
