// The operations departure board: one train boarding (a split-flap countdown on the
// shared 1-second clock), the rest listed at minute precision. Every "next" is a
// SCHEDULED trigger derived in this tab from the public Terraform cadence
// (lib/schedule.ts ≡ infra/terraform/schedules.tf) — a countdown is a promise of an
// attempt, never a success claim. The last-seen column carries only what the read-only
// API can actually prove (/health timestamps, the latest Merkle commit) and says
// "not surfaced" plainly where it can't — the API serves records, not job telemetry.
//
// A leaf component on purpose: useNow(1000) re-renders this board once a second and
// nothing else on the page.
import { api } from "../../api";
import { useHealth } from "../../components/layout/HealthContext";
import { FlapNumber } from "../../components/ui/FlapNumber";
import { REPO_URL } from "../../lib/facts";
import { nextRun, nextUp, SCHEDULE, untilLabel, atLabel, type JobEvidence } from "../../lib/schedule";
import { useApi } from "../../lib/useApi";
import { relTime, useNow } from "../../lib/useRelativeTime";

function HeroCountdown({ atMs, nowMs }: { atMs: number; nowMs: number }) {
  const rem = Math.max(0, atMs - nowMs);
  const h = Math.floor(rem / 3600_000);
  const m = Math.floor((rem % 3600_000) / 60_000);
  const s = Math.floor((rem % 60_000) / 1000);
  // aria-live stays OFF — a per-second live region is hostile (the hero's own rule);
  // each FlapNumber carries an sr-only value
  return (
    <span className="rb-flap">
      {h > 0 && (
        <>
          <FlapNumber value={h} pad={2} label="hours" />
          <span className="nf-sep">:</span>
        </>
      )}
      <FlapNumber value={m} pad={2} label="minutes" />
      <span className="nf-sep">:</span>
      <FlapNumber value={s} pad={2} label="seconds" />
    </span>
  );
}

export function NextRunsBoard() {
  const now = useNow(1000);
  const { health } = useHealth();
  // real evidence for the merkle row — one request, and the endpoint is max-age 300
  const merkle = useApi(() => api.merkleRoots(1));
  const sealedAt = merkle.data?.items[0]?.committed_at_utc ?? null;

  const boarding = nextUp(SCHEDULE, now);

  const seen = (e: JobEvidence): { text: string; title?: string } => {
    const rel = (iso: string | null | undefined) =>
      iso ? { text: relTime(iso, now), title: iso } : { text: "—" };
    switch (e) {
      case "full-ingest":
        return rel(health?.last_full_ingest);
      case "ingest":
        return rel(health?.last_ingest);
      case "grade":
        return rel(health?.last_grade);
      case "merkle":
        return rel(sealedAt);
      case "none":
        return {
          text: "not surfaced by the API",
          title: "The API surfaces records, not job telemetry — by design.",
        };
    }
  };

  return (
    <div className="runs-board-wrap">
      <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
        Scheduled next triggers, computed in this tab from the public cadence (
        <a
          href={`${REPO_URL}/blob/main/infra/terraform/schedules.tf`}
          target="_blank"
          rel="noreferrer"
        >
          schedules.tf ↗
        </a>
        ) — a countdown promises an attempt, not a success. “Last seen” shows only what the
        read-only API can prove.
      </p>
      <div className="table-scroll">
        <table className="data-table runs-board">
          <thead>
            <tr>
              <th>job</th>
              <th>cadence (UTC)</th>
              <th>next</th>
              <th>last seen</th>
            </tr>
          </thead>
          <tbody>
            {SCHEDULE.map((row) => {
              const at = nextRun(row.spec, now);
              const hero = row.key === boarding.row.key;
              const lastSeen = seen(row.evidence);
              return (
                <tr key={row.key} className={hero ? "rb-hero" : undefined} title={row.note}>
                  <td>{row.job}</td>
                  <td className="mono rb-cadence">{row.cadence}</td>
                  <td className="mono rb-next">
                    {hero ? (
                      <>
                        <HeroCountdown atMs={at} nowMs={now} />
                        <span className="rb-at"> → {atLabel(at)}</span>
                      </>
                    ) : (
                      `${untilLabel(at, now)} · ${atLabel(at)}`
                    )}
                  </td>
                  <td
                    className={`mono rb-seen${lastSeen.text === "not surfaced by the API" ? " rb-none" : ""}`}
                    title={lastSeen.title}
                  >
                    {lastSeen.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {health && !health.freshness_ok && (
        <p className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--warn)" }}>
          inputs stale — the 36 h freshness threshold is exceeded; a forecast issued now
          would be tagged STALE on its own record
        </p>
      )}
    </div>
  );
}
