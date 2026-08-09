// The prover, upgraded from a self-check to an AUDIT. Steps 1–3 recompute the forecast's
// SHA-256 in this browser (WebCrypto) and compare it against the stored write-once hash —
// that much only proves the server agrees with itself. Steps 4–5 are the reason this
// device exists: the browser fetches the day's anchor file from raw.githubusercontent.com
// — a host we do not control — finds this hash at its line, and recomputes the day's
// Merkle root from ALL of the file's lines. The server supplied the document; a third
// party supplies the record.
//
// Honesty rules, authored here because rendering is where they could quietly erode:
//   · "unreachable" is NEVER an ✕ — we failed to CHECK, we did not fail THE check. The
//     ✕ mark is reserved for integrity failures (hash mismatch, absence from a SEALED
//     day, a sealed root that does not reproduce). "couldn't check" is a dash.
//   · absence from an UNSEALED day is soft: GitHub's CDN caches ~5 minutes and anchor
//     pushes are eventual. Only after the 12:00 UTC seal is absence alarming.
//   · seal-pending is not a failure — the computed root is shown so the reader can hold
//     us to it after the seal lands.
// All pacing (beat floors, the per-char reveal) is presentation only, zeroed under
// prefers-reduced-motion so only real latency remains. Timers here are one-shot and
// event-bounded (the docs/motion.md rule-7 exemption class).
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../../lib/useMediaQuery";
import {
  auditAnchorText,
  fetchAnchorFile,
  sealDueIso,
  sha256Hex,
  type AnchorAudit,
  type AnchorFetch,
} from "../../lib/anchorAudit";

type Phase = "idle" | "computing" | "revealing" | "mismatch" | "fetching" | "auditing" | "done";

type AuditOutcome =
  | { kind: "audit"; audit: AnchorAudit; bytes: number }
  | { kind: "unreachable" }
  | { kind: "timeout" }
  | { kind: "http"; status: number }
  | { kind: "no-anchor" };

type Mark = "pending" | "ok" | "skip" | "fail";

const REVEAL_MS = 25; // per char, during the user-triggered moment only
const MIN_BEAT_MS = 600; // each narrative beat should read, even when the work is instant

const MARK_GLYPH: Record<Mark, string> = { pending: "·", ok: "✓", skip: "–", fail: "✕" };
const MARK_CLASS: Record<Mark, string> = { pending: "", ok: " done", skip: " skip", fail: " fail" };

function short(hex: string): string {
  return `${hex.slice(0, 12)}…`;
}

export function HashProof({
  canonicalJson,
  storedHash,
  anchorDay,
  anchorRawUrl,
  anchorHtmlUrl,
  sealedRoot,
  autoRun,
}: {
  canonicalJson: string;
  storedHash: string;
  anchorDay: string | null;
  anchorRawUrl: string | null;
  anchorHtmlUrl: string | null;
  /** The committed Merkle root for anchorDay, or null while the day is unsealed. */
  sealedRoot: string | null;
  autoRun?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<AuditOutcome | null>(null);
  const [revealed, setRevealed] = useState(0);
  const computedRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);
  const autoRanRef = useRef(false);
  // the re-entrancy guard is a REF, not the render-time `running` closure: a click racing
  // the autoRun effect could otherwise start two interleaved runs whose reveal intervals
  // share one timerRef slot — the loser's interval would never be cleared
  const inFlightRef = useRef(false);
  const supported = typeof crypto !== "undefined" && !!crypto.subtle;
  // live-subscribing (useMediaQuery — framer's hook and a one-shot .matches read both
  // freeze the OS setting at mount)
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const sealed = sealedRoot !== null;
  const fileLabel = anchorDay ? `anchors/${anchorDay}.jsonl` : "the public anchor file";
  const running =
    phase === "computing" || phase === "revealing" || phase === "fetching" || phase === "auditing";

  async function run() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setPhase("computing");
      setOutcome(null);
      setRevealed(0);
      // the GitHub fetch starts NOW, in parallel with the hash — the narrative is ordered,
      // the I/O isn't (it self-bounds at FETCH_TIMEOUT_MS, so an ignored result just settles)
      const fetchPromise: Promise<AnchorFetch | null> = anchorRawUrl
        ? fetchAnchorFile(anchorRawUrl)
        : Promise.resolve(null);
      const beat = () =>
        reduced ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, MIN_BEAT_MS));
      const started = Date.now();
      let hex: string;
      try {
        hex = await sha256Hex(canonicalJson);
      } catch {
        setPhase("idle");
        return;
      }
      computedRef.current = hex;
      const wait = MIN_BEAT_MS - (Date.now() - started);
      if (!reduced && wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (!aliveRef.current) return;
      const hashOk = hex === storedHash;
      if (reduced) {
        setRevealed(hex.length);
      } else {
        setPhase("revealing");
        await new Promise<void>((resolve) => {
          // a LOCAL handle: the clear inside the updater must target THIS run's interval,
          // never whatever timerRef holds; the ref only mirrors it for unmount cleanup
          const t = setInterval(() => {
            setRevealed((n) => {
              if (n + 1 >= hex.length) {
                clearInterval(t);
                resolve();
                return hex.length;
              }
              return n + 1;
            });
          }, REVEAL_MS);
          timerRef.current = t;
        });
        if (!aliveRef.current) return;
      }
      if (!hashOk) {
        setPhase("mismatch");
        return;
      }
      setPhase("fetching");
      const [fetched] = await Promise.all([fetchPromise, beat()]);
      if (!aliveRef.current) return;
      if (fetched === null) {
        setOutcome({ kind: "no-anchor" });
        setPhase("done");
        return;
      }
      if (!fetched.ok) {
        setOutcome(
          fetched.kind === "http" ? { kind: "http", status: fetched.status } : { kind: fetched.kind },
        );
        setPhase("done");
        return;
      }
      setPhase("auditing");
      const [audit] = await Promise.all([
        auditAnchorText(fetched.text, storedHash, sealedRoot),
        beat(),
      ]);
      if (!aliveRef.current) return;
      setOutcome({ kind: "audit", audit, bytes: fetched.bytes });
      setPhase("done");
    } finally {
      inFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (autoRun && supported && !autoRanRef.current) {
      autoRanRef.current = true;
      void run();
    }
    // one-shot on mount by design — the ref guards StrictMode's double effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) {
    return (
      <div className="prover">
        <span className="pv-caption">verify in this browser</span>
        <p className="blurb">
          This browser doesn't expose WebCrypto here, so use the offline recipe on the left:
          same document, same hash, your machine.
        </p>
      </div>
    );
  }

  const computed = computedRef.current;
  const audit = outcome?.kind === "audit" ? outcome.audit : null;
  const line = audit && audit.kind !== "absent" ? audit.line : null;
  const lineUrl = line && anchorHtmlUrl ? `${anchorHtmlUrl}#L${line.n}` : null;
  const historyUrl = anchorHtmlUrl?.includes("/blob/")
    ? anchorHtmlUrl.replace("/blob/", "/commits/")
    : anchorHtmlUrl;
  const due = anchorDay ? sealDueIso(anchorDay) : null;
  const sealDue = due ? due.replace("T", " ").replace(":00Z", " UTC") : null;
  // a "verified" whose file carries lines OUTSIDE the sealed set is its own verdict —
  // root reproduction proves the sealed records, not the whole file
  const foreignLines = audit && audit.kind === "verified" ? audit.malformed : [];

  // ——— step 4: the record (was this hash published by a third party?) ———
  let recordMark: Mark = "pending";
  let recordText: React.ReactNode = "found in the public anchor file on GitHub, not our API";
  if (phase === "mismatch") {
    recordMark = "skip";
  } else if (phase === "done" && outcome) {
    if (line) {
      recordMark = "ok";
      recordText = (
        <>
          {/* "of N" counts FILE lines (what GitHub shows), never leaves — with a blank or
              malformed line in the file the two differ, and "line 12 of 11" is nonsense */}
          found on line {line.n} of {audit!.lineCount} in{" "}
          {lineUrl ? (
            <a href={lineUrl} target="_blank" rel="noreferrer">
              {fileLabel} ↗
            </a>
          ) : (
            fileLabel
          )}
          {outcome.kind === "audit" ? ` · ${outcome.bytes.toLocaleString()} B from GitHub's CDN` : ""}
        </>
      );
    } else if (audit?.kind === "absent") {
      recordMark = audit.sealed ? "fail" : "skip";
      recordText = audit.sealed
        ? `NOT in ${fileLabel}, absent from a sealed day`
        : `not in ${fileLabel} yet; pushes are eventual, GitHub's CDN caches ~5 min`;
    } else if (outcome.kind === "unreachable") {
      recordText = "GitHub unreachable from this page, so the check didn't run";
      recordMark = "skip";
    } else if (outcome.kind === "timeout") {
      recordText = "GitHub didn't answer within 5 s, so the check didn't run";
      recordMark = "skip";
    } else if (outcome.kind === "http") {
      const hard = outcome.status === 404 && sealed;
      recordMark = hard ? "fail" : "skip";
      recordText = hard
        ? `GitHub returned 404 for a SEALED day's file`
        : `GitHub returned ${outcome.status}, so the check didn't run`;
    } else if (outcome.kind === "no-anchor") {
      recordMark = "skip";
      recordText = "no public anchor location recorded for this forecast";
    }
  }

  // ——— step 5: the seal (does the whole public file reproduce the committed root?) ———
  let sealMark: Mark = "pending";
  let sealText: React.ReactNode = "day's Merkle root reproduced from the public lines";
  if (phase === "mismatch") {
    sealMark = "skip";
  } else if (phase === "done" && outcome) {
    if (audit?.kind === "verified") {
      sealMark = "ok";
      sealText =
        audit.malformed.length === 0
          ? `sealed root reproduced from all ${audit.leafCount} public lines · ${short(audit.root)}`
          : `sealed root reproduced from the ${audit.leafCount} well-formed lines · ${short(audit.root)}`;
    } else if (audit?.kind === "seal-pending") {
      sealMark = "pending";
      sealText = `computed ${short(audit.computedRoot)} from ${audit.leafCount} lines · day seals at 12:00 UTC`;
    } else if (audit?.kind === "root-mismatch") {
      sealMark = "fail";
      sealText =
        audit.malformed.length === 0
          ? `computed ${short(audit.computedRoot)} ≠ sealed ${short(audit.expectedRoot)}`
          : `computed ${short(audit.computedRoot)} ≠ sealed ${short(audit.expectedRoot)} · ${audit.malformed.length} malformed line(s)`;
    } else {
      sealMark = "skip";
      sealText = "Merkle root not recomputed: no public file to audit";
    }
  }

  const steps: { mark: Mark; text: React.ReactNode }[] = [
    {
      mark: phase === "idle" ? "pending" : "ok",
      text: `canonical bytes assembled · ${new TextEncoder().encode(canonicalJson).length} B`,
    },
    {
      mark: phase === "idle" || phase === "computing" ? "pending" : "ok",
      text: "SHA-256 computed in this browser (WebCrypto)",
    },
    {
      mark:
        phase === "mismatch"
          ? "fail"
          : phase === "fetching" || phase === "auditing" || phase === "done"
            ? "ok"
            : "pending",
      text:
        phase === "mismatch"
          ? "does NOT match the stored write-once hash"
          : "matches the stored write-once hash",
    },
    { mark: recordMark, text: recordText },
    { mark: sealMark, text: sealText },
  ];

  const terminal = phase === "done" || phase === "mismatch";

  return (
    <div className="prover">
      <span className="pv-caption">verify in this browser · no server, no trust</span>
      {/* aria-disabled, NOT disabled: a disabled button drops keyboard focus to <body>
          mid-interaction (the states.tsx rule) — the click is guarded instead */}
      <button
        type="button"
        className={`btn primary${running ? " busy" : ""}`}
        onClick={running ? undefined : run}
        aria-disabled={running || undefined}
        aria-busy={running || undefined}
      >
        {running && <span className="spinner" aria-hidden />}
        {phase === "idle" ? "Recompute & audit against GitHub" : terminal ? "Run it again" : "Verifying…"}
      </button>
      <div className="pv-steps">
        {steps.map((s, i) => (
          <div key={i} className={`pv-step${MARK_CLASS[s.mark]}`}>
            <span className="pv-mark" aria-hidden>
              {MARK_GLYPH[s.mark]}
            </span>
            <span>{s.text}</span>
          </div>
        ))}
      </div>
      <div className="pv-hash" aria-hidden={!computed || undefined}>
        {computed &&
          computed.split("").map((c, i) => {
            const shown = phase === "revealing" ? i < revealed : phase !== "computing";
            const hit = shown && storedHash[i] === c;
            return (
              <span key={i} className={hit ? "hit" : undefined}>
                {shown ? c : "·"}
              </span>
            );
          })}
      </div>
      <div aria-live="polite">
        {phase === "mismatch" && (
          <>
            <span className="pv-verdict mismatch">✕ hash mismatch</span>
            <p className="blurb">
              The recomputed digest does not reproduce the stored value. That would indicate
              tampering. Surfaced, never hidden. The offline recipe on the left is the
              independent check.
            </p>
          </>
        )}
        {phase === "done" && audit?.kind === "verified" && foreignLines.length === 0 && (
          <>
            <span className="pv-verdict holds">⬡ proof holds</span>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              The hash was recomputed from the document in this browser, found in the public
              anchor file served by GitHub (not our API), and the day's Merkle root reproduced
              from all {audit.leafCount} public lines. The server supplied the document; a third
              party supplied the record.
            </p>
          </>
        )}
        {phase === "done" && audit?.kind === "verified" && foreignLines.length > 0 && (
          <>
            {/* the sealed SET verified; the FILE did not — a root that reproduces proves the
                anchor records, and says nothing about lines that aren't anchor records. On a
                sealed day such lines can only postdate the seal (a non-JSON line present at
                sealing crashes the sealer; a junk hash makes the roots disagree). */}
            <span className="pv-verdict partial">✓ sealed set verified, foreign lines in file</span>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              The day's sealed root reproduces from the file's {audit.leafCount} well-formed
              anchor lines, but the file also carries {foreignLines.length} line
              {foreignLines.length === 1 ? "" : "s"} that {foreignLines.length === 1 ? "is" : "are"}{" "}
              not an anchor record (line {foreignLines.join(", ")}). On a sealed day that means
              content entered the file after sealing. Surfaced, never hidden.{" "}
              {historyUrl && (
                <a href={historyUrl} target="_blank" rel="noreferrer">
                  file history ↗
                </a>
              )}
            </p>
          </>
        )}
        {phase === "done" && audit?.kind === "seal-pending" && (
          <>
            <span className="pv-verdict partial">✓ hash verified, seal pending</span>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              This line is already in the public file. The day's Merkle seal lands at{" "}
              {sealDue ?? "12:00 UTC the next day"}. Run this again after that and the root
              check goes live. The computed root above is shown now so you can hold us to it.
            </p>
          </>
        )}
        {phase === "done" && audit?.kind === "absent" && audit.sealed && (
          <>
            <span className="pv-verdict mismatch">✕ missing from sealed day</span>
            <p className="blurb">
              This forecast's hash is not in the sealed public file. That would indicate the
              record was altered after the fact. Surfaced, never hidden.{" "}
              {historyUrl && (
                <a href={historyUrl} target="_blank" rel="noreferrer">
                  file history ↗
                </a>
              )}
            </p>
          </>
        )}
        {phase === "done" && audit?.kind === "absent" && !audit.sealed && (
          <>
            <span className="pv-verdict partial">✓ hash verified, not published yet</span>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              The line isn't visible in the public file yet; GitHub's CDN caches for ~5 minutes
              and anchor pushes are eventual. The day seals at{" "}
              {sealDue ?? "12:00 UTC the next day"}; absence only becomes a failure after that.
            </p>
          </>
        )}
        {phase === "done" && audit?.kind === "root-mismatch" && (
          <>
            <span className="pv-verdict mismatch">✕ seal mismatch</span>
            <p className="blurb">
              The Merkle root recomputed from the file's {audit.leafCount} well-formed anchor
              lines ({audit.lineCount} lines in total
              {audit.malformed.length > 0
                ? `, ${audit.malformed.length} of them not an anchor record (line ${audit.malformed.join(", ")})`
                : ""}
              ) does not reproduce the sealed root. That would indicate the file was rewritten
              after sealing. Surfaced, never hidden.{" "}
              {historyUrl && (
                <a href={historyUrl} target="_blank" rel="noreferrer">
                  file history ↗
                </a>
              )}
            </p>
          </>
        )}
        {phase === "done" && (outcome?.kind === "unreachable" || outcome?.kind === "timeout") && (
          <>
            <span className="pv-verdict partial">✓ hash verified, record unchecked</span>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              {outcome.kind === "timeout"
                ? "GitHub didn't answer within 5 seconds, so the record check didn't run. Nothing failed."
                : "This page couldn't reach raw.githubusercontent.com (network, or this deployment's content-security policy), so the record check didn't run. Nothing failed."}{" "}
              Audit it yourself:{" "}
              {anchorRawUrl && (
                <a href={anchorRawUrl} target="_blank" rel="noreferrer">
                  the raw file ↗
                </a>
              )}
            </p>
          </>
        )}
        {phase === "done" && outcome?.kind === "http" && (
          <>
            <span className={`pv-verdict ${outcome.status === 404 && sealed ? "mismatch" : "partial"}`}>
              {outcome.status === 404 && sealed
                ? "✕ sealed file missing"
                : "✓ hash verified, record unchecked"}
            </span>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              {outcome.status === 404 && sealed
                ? "GitHub returned 404 for a sealed day's anchor file, and a sealed file should never disappear. Surfaced, never hidden."
                : outcome.status === 404
                  ? "GitHub returned 404. The day's file may simply not be pushed yet; publication is eventual until the 12:00 UTC seal."
                  : `GitHub returned ${outcome.status}, so the record check didn't run. Nothing failed.`}{" "}
              {historyUrl && (
                <a href={historyUrl} target="_blank" rel="noreferrer">
                  file history ↗
                </a>
              )}
            </p>
          </>
        )}
        {phase === "done" && outcome?.kind === "no-anchor" && (
          <>
            <span className="pv-verdict partial">✓ hash verified</span>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              The server recorded no public anchor location for this forecast, so there is no
              third-party record to audit. The hash proof above still ran on your machine.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
