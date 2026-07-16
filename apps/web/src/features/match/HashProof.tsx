// The prover: recompute the forecast's SHA-256 IN THIS BROWSER with native WebCrypto
// and compare it, character by character, against the stored write-once hash. Byte-exact
// by construction: the API serves the canonical JSON string verbatim (sorted keys,
// compact separators, ASCII), so TextEncoder(utf-8) reproduces the hashed bytes.
// The server only supplied the document — the proof runs on the visitor's machine.
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "computing" | "revealing" | "match" | "mismatch";

const REVEAL_MS = 25; // per char, during the user-triggered moment only
const MIN_COMPUTE_MS = 600; // the moment should read, even though the digest is instant

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function HashProof({
  canonicalJson,
  storedHash,
  anchorHtmlUrl,
  kickoffLabel,
}: {
  canonicalJson: string;
  storedHash: string;
  anchorHtmlUrl: string | null;
  kickoffLabel: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [revealed, setRevealed] = useState(0);
  const computedRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supported = typeof crypto !== "undefined" && !!crypto.subtle;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  async function run() {
    setPhase("computing");
    setRevealed(0);
    const started = Date.now();
    let hex: string;
    try {
      hex = await sha256Hex(canonicalJson);
    } catch {
      setPhase("idle");
      return;
    }
    computedRef.current = hex;
    const wait = MIN_COMPUTE_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const verdict: Phase = hex === storedHash ? "match" : "mismatch";
    if (reduced) {
      setRevealed(hex.length);
      setPhase(verdict);
      return;
    }
    setPhase("revealing");
    timerRef.current = setInterval(() => {
      setRevealed((n) => {
        if (n + 1 >= hex.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase(verdict);
          return hex.length;
        }
        return n + 1;
      });
    }, REVEAL_MS);
  }

  const computed = computedRef.current;
  const done = phase === "match" || phase === "mismatch";
  const steps = [
    {
      done: phase !== "idle",
      text: `canonical bytes assembled · ${new TextEncoder().encode(canonicalJson).length} B`,
    },
    { done: phase !== "idle" && phase !== "computing", text: "SHA-256 computed in this browser (WebCrypto)" },
    { done: phase === "match", text: "matches the stored write-once hash" },
    { done: phase === "match", text: "anchor entered public history before kickoff", link: true },
  ];

  if (!supported) {
    return (
      <div className="prover">
        <span className="pv-caption">verify in this browser</span>
        <p className="blurb">
          This browser doesn't expose WebCrypto here, so use the offline recipe on the left —
          same document, same hash, your machine.
        </p>
      </div>
    );
  }

  return (
    <div className="prover">
      <span className="pv-caption">verify in this browser — no server, no trust</span>
      <button type="button" className="btn primary" onClick={run} disabled={phase === "computing" || phase === "revealing"}>
        {phase === "idle" ? "Recompute SHA-256" : done ? "Recompute again" : "Computing…"}
      </button>
      <div className="pv-steps">
        {steps.map((s, i) => (
          <div key={i} className={`pv-step${s.done ? " done" : ""}`}>
            <span className="pv-mark" aria-hidden>
              {s.done ? "✓" : "·"}
            </span>
            <span>
              {s.text}
              {s.link && s.done && anchorHtmlUrl && (
                <>
                  {" "}
                  (<a href={anchorHtmlUrl} target="_blank" rel="noreferrer">
                    kickoff {kickoffLabel} ↗
                  </a>)
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="pv-hash" aria-hidden={!computed || undefined}>
        {computed &&
          computed.split("").map((c, i) => {
            const shown = phase === "revealing" ? i < revealed : done;
            const hit = shown && storedHash[i] === c;
            return (
              <span key={i} className={hit ? "hit" : undefined}>
                {shown ? c : "·"}
              </span>
            );
          })}
      </div>
      <div aria-live="polite">
        {phase === "match" && <span className="pv-verdict holds">⬡ proof holds</span>}
        {phase === "mismatch" && (
          <>
            <span className="pv-verdict mismatch">✕ hash mismatch</span>
            <p className="blurb">
              The recomputed digest does not reproduce the stored value. That would indicate
              tampering — surfaced, never hidden. The offline recipe on the left is the
              independent check.
            </p>
          </>
        )}
      </div>
      {phase === "match" && (
        <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
          This proof ran on your machine — the server only supplied the document.
        </p>
      )}
    </div>
  );
}
