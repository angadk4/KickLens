// 90 days of daily tamper-evidence, as a strip you can count.
//
// The merkle-roots endpoint has always served up to 180 days; the app asked for 1. This is the
// same data, shown as what it actually is: a growing streak of days whose forecasts were sealed
// into a Merkle root and pushed to a public repository.
//
// The caption (lib/sealStrip) is load-bearing and unit-tested: one cell is one CALENDAR DAY,
// and an empty cell means no official forecast was issued — not a missed seal.
import { api, paths, prefetchPath } from "../../api";
import { buildStrip, sealedCount, stripCaption } from "../../lib/sealStrip";
import { useApi } from "../../lib/useApi";

const DAYS = 90;

/**
 * Start this strip's fetch WITHOUT mounting it.
 *
 * Both hosts render <SealStrip/> inside a `{data && …}` gate, so its request could not begin
 * until the page's own request had resolved — two serial round trips, and on a cold backend two
 * serial database wakes. Calling this at page mount starts it in parallel; the component then
 * dedups onto the same in-flight promise (lib/requestCache) when it finally mounts. The gate and
 * the layout are untouched.
 */
export function warmSealStrip(): void {
  prefetchPath(paths.merkleRoots(DAYS));
}

export function SealStrip() {
  const { data } = useApi(() => api.merkleRoots(DAYS));
  if (!data?.items) return null;
  const strip = buildStrip(data.items, Date.now(), DAYS);
  const sealed = sealedCount(strip);
  if (sealed === 0) return null; // nothing sealed yet: the empty state says it in prose

  return (
    <figure className="seal-strip">
      {/* aria-hidden, and deliberately: 90 cells each announcing its own date and root is a
          screen-reader wall, not information. The figcaption already carries the count and what
          a cell means, and the <details> table below gives every sealed day with its root and
          commit time in a navigable form. Sighted users get the shape; everyone gets the data. */}
      <div className="ss-cells" aria-hidden>
        {strip.map((d, i) => {
          const label = d.root
            ? `${d.day} · root ${d.root.slice(0, 12)}…${d.committedAt ? ` · committed ${d.committedAt}` : ""}`
            : d.pending
              ? `${d.day} · seal pending: roots are committed at 12:00 UTC the following day`
              : `${d.day} · no official forecast issued`;
          // cells fill left→right as the strip appears: the steps ARE the data, which
          // docs/motion.md licenses as an exception to the 3-step stagger cap
          return (
            <span
              key={d.day}
              className={`ss-cell${d.root ? " sealed" : d.pending ? " pending" : ""}`}
              style={{ ["--i" as string]: i }}
              title={label}
            />
          );
        })}
      </div>
      <figcaption>{stripCaption(strip)}</figcaption>
      <details>
        <summary className="chip" style={{ cursor: "pointer" }}>
          the {sealed} sealed days, with their roots
        </summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Merkle root</th>
              <th>Committed</th>
            </tr>
          </thead>
          <tbody>
            {[...strip]
              .reverse()
              .filter((d) => d.root)
              .map((d) => (
                <tr key={d.day}>
                  <td className="num">{d.day}</td>
                  <td className="mono">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer">
                        {d.root!.slice(0, 16)}… ↗
                      </a>
                    ) : (
                      `${d.root!.slice(0, 16)}…`
                    )}
                  </td>
                  <td className="num">{d.committedAt ?? "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
