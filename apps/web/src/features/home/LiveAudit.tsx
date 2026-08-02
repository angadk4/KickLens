// The home page's flagship device: audit a REAL forecast, live, against GitHub — never a
// demo, never fixture data. The target is the newest match on the graded record (falling
// back to a sealed one pre-grading; rendering NOTHING if the record is empty — honest
// emptiness over a staged demo). Nothing is fetched until the reader clicks: the home
// page pays zero request cost for this section, because the target rides the shared
// completed(1) call UpcomingContext already makes.
//
// THE CAPTURE RULE (adversarial-review fix): the ready state renders identity and proof
// from ONE snapshot taken at click time. `target` is live — the shared context re-polls
// every 3 minutes on a matchday, and a newer grading can replace it mid-audit — so a
// ready card that read identity from the live value could caption match A's proof with
// match B's names. Worse than no device at all, on a page about honesty. The audited
// forecast is also selected BY THE CAPTURED HASH, never by "first non-voided", so the
// document audited is provably the one the card named.
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Verification } from "../../api";
import { useUpcoming } from "../../components/layout/UpcomingContext";
import { Section } from "../../components/ui/Section";
import { ErrorState } from "../../components/ui/states";
import { dateShort, shortHash, teamName } from "../../lib/format";
import { HashProof } from "../match/HashProof";

type Target = {
  id: number;
  home: string;
  away: string;
  kickoff: string;
  hash: string;
  graded: boolean;
};

type AuditState =
  | { phase: "idle" }
  | { phase: "loading"; t: Target }
  | { phase: "error"; t: Target; retrying: boolean }
  | { phase: "ready"; t: Target; v: Verification };

export function LiveAudit() {
  const { latestGraded, inPlay, list } = useUpcoming();
  const [state, setState] = useState<AuditState>({ phase: "idle" });
  const inFlightRef = useRef(false);

  // graded beats sealed (its day is likelier to be sealed, so the chain can complete);
  // any official-frozen forecast is still a real, auditable object before grading
  const target = useMemo<Target | null>(() => {
    if (latestGraded) {
      return {
        id: latestGraded.match_id,
        home: latestGraded.home,
        away: latestGraded.away,
        kickoff: latestGraded.kickoff_utc,
        hash: latestGraded.forecast_hash,
        graded: true,
      };
    }
    const ip = inPlay?.find((m) => m.forecast.forecast_hash);
    if (ip) {
      return {
        id: ip.match_id,
        home: ip.home,
        away: ip.away,
        kickoff: ip.kickoff_utc,
        hash: ip.forecast.forecast_hash!,
        graded: false,
      };
    }
    const frozen = list?.find(
      (m) => m.forecast?.type === "official-frozen" && m.forecast.forecast_hash,
    );
    if (frozen) {
      return {
        id: frozen.match_id,
        home: frozen.home,
        away: frozen.away,
        kickoff: frozen.kickoff_utc,
        hash: frozen.forecast!.forecast_hash!,
        graded: false,
      };
    }
    return null;
  }, [latestGraded, inPlay, list]);

  // empty record and no sealed forecast: nothing real to audit, so nothing fake to show
  if (!target) return null;

  const busy =
    state.phase === "loading" || (state.phase === "error" && state.retrying);

  const load = (retrying = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const t = target; // captured — the snapshot every later render describes
    setState(retrying ? { phase: "error", t, retrying: true } : { phase: "loading", t });
    api
      .verification(t.id)
      .then((v) => setState({ phase: "ready", t, v }))
      .catch(() => setState({ phase: "error", t, retrying: false }))
      .finally(() => {
        inFlightRef.current = false;
      });
  };

  // the audited document must BE the one the card named — matched by the captured hash,
  // never by position in the forecasts array
  const f =
    state.phase === "ready"
      ? (state.v.forecasts.find(
          (x) => x.forecast_hash === state.t.hash && x.canonical_json,
        ) ?? null)
      : null;

  return (
    <Section
      eyebrow="Audit"
      meta={["raw.githubusercontent.com", "runs in your browser"]}
      title="Audit the record, live, against GitHub"
      description={
        <>
          The claims this site makes are exactly the kind you shouldn't take on faith. So
          don't: re-verify a real forecast on your own machine, against the public record on
          a host we don't control.
        </>
      }
    >
      {state.phase !== "ready" && (
        <div className="card la-card">
          <p className="blurb">
            The target is{" "}
            {target.graded
              ? "the newest match on the graded record"
              : "the newest sealed official forecast"}{" "}
            — <strong>{teamName(target.home)}</strong> vs{" "}
            <strong>{teamName(target.away)}</strong>, {dateShort(target.kickoff)}, hash{" "}
            <span className="mono">⬡ {shortHash(target.hash)}</span>. One click: recompute
            its SHA-256 from the canonical document, fetch the day's anchor file from
            GitHub's CDN, find the line, and reproduce the day's sealed Merkle root — all in
            this tab.
          </p>
          {/* aria-disabled, not disabled — the states.tsx busy-button rule */}
          <button
            type="button"
            className={`btn primary${busy ? " busy" : ""}`}
            onClick={busy ? undefined : () => load()}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
          >
            {busy && <span className="spinner" aria-hidden />}
            {busy ? "Fetching the document…" : "Audit it now"}
          </button>
          {state.phase === "error" && (
            <ErrorState
              what="the forecast's verification document"
              retry={() => load(true)}
              retrying={state.retrying}
            />
          )}
        </div>
      )}
      {state.phase === "ready" &&
        (f?.canonical_json ? (
          <div className="card la-card">
            <p className="blurb">
              Auditing the official forecast for <strong>{teamName(state.t.home)}</strong> vs{" "}
              <strong>{teamName(state.t.away)}</strong> — the full proof bench has the
              document field by field: <Link to={`/match/${state.t.id}`}>open it →</Link>
            </p>
            <HashProof
              canonicalJson={f.canonical_json}
              storedHash={f.forecast_hash}
              anchorDay={f.anchor_day}
              anchorRawUrl={f.anchor_file?.raw_url ?? null}
              anchorHtmlUrl={f.anchor_file?.html_url ?? null}
              sealedRoot={f.merkle?.root ?? null}
              autoRun
            />
          </div>
        ) : (
          // either the server withheld canonical_json (it only releases it when its own
          // recompute matches) or the named hash is no longer among the match's forecasts
          // (voided and reissued mid-click) — both are bench material, not home material
          <div className="card la-card">
            <p className="blurb">
              The server did not release a canonical document for the forecast this card
              named (hash <span className="mono">⬡ {shortHash(state.t.hash)}</span>) — it
              only does so when its own recompute matches, and a voided-and-reissued forecast
              keeps its old hash on the record. Inspect it on{" "}
              <Link to={`/match/${state.t.id}`}>the full proof bench →</Link>
            </p>
          </div>
        ))}
    </Section>
  );
}
