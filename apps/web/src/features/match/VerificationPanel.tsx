// The proof bench: evidence on the left (stored fields, canonical document, anchor line,
// event trail), the prover on the right — an in-browser WebCrypto recompute of the same
// hash. canonical_json is only served when the server-side recompute already matches.
import type { VerifiedForecast, Verification } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { dateShort, voidPhrase } from "../../lib/format";
import { HashProof } from "./HashProof";

function Forecast({
  f,
  repo,
  kickoffUtc,
}: {
  f: VerifiedForecast;
  repo: string | null;
  kickoffUtc: string | null;
}) {
  const voidReason = f.events.find((e) => e.type === "Voided")?.details?.reason;
  const vp = voidPhrase(typeof voidReason === "string" ? voidReason : undefined);
  return (
    <div className="card verify-panel">
      <div className="verify-status">
        {f.hash_match ? (
          <>
            <span style={{ color: "var(--success)" }}>✓</span>
            <span>
              hash verified — recomputed from the database and it matches the stored,
              write-once value
            </span>
          </>
        ) : (
          <>
            <span style={{ color: "var(--danger)" }}>✕</span>
            <span>
              HASH MISMATCH — the stored value does not reproduce from the stored fields. This
              would indicate tampering and is surfaced, never hidden.
            </span>
          </>
        )}
        {f.voided && (
          <Badge kind="voided" label={vp ? `✕ VOIDED · ${vp}` : "✕ VOIDED"} />
        )}
      </div>

      <div className="proof-bench">
        <div style={{ display: "grid", gap: "var(--space-4)", minWidth: 0 }}>
          <dl className="kv">
            <dt>stored hash</dt>
            <dd>{f.forecast_hash}</dd>
            <dt>recomputed</dt>
            <dd>{f.recomputed_hash}</dd>
            <dt>anchored at</dt>
            <dd>{f.anchored_at_utc ?? "—"}</dd>
            <dt>model</dt>
            <dd>
              {f.model_label} · seed {f.seed}
              {f.stale_inputs ? " · issued under STALE inputs (tagged)" : ""}
            </dd>
            <dt>code commit</dt>
            <dd>{f.code_git_sha}</dd>
            <dt>lockfile</dt>
            <dd>{f.lockfile_hash}</dd>
            {f.merkle && (
              <>
                <dt>merkle root ({f.merkle.day})</dt>
                <dd>{f.merkle.root}</dd>
              </>
            )}
          </dl>

          {f.canonical_json && (
            <div>
              <p className="blurb" style={{ marginBottom: "var(--space-2)" }}>
                The canonical document below SHA-256-hashes to the stored value. Save it as{" "}
                <code>forecast.json</code> (bytes exactly as shown), then:
              </p>
              <pre className="codeblock">{f.canonical_json}</pre>
              <pre className="codeblock">{`python -c "import hashlib;print(hashlib.sha256(open('forecast.json','rb').read()).hexdigest())"`}</pre>
            </div>
          )}

          {f.expected_anchor_line && f.anchor_file && (
            <div>
              <p className="blurb" style={{ marginBottom: "var(--space-2)" }}>
                This exact line was appended to the public anchor file{" "}
                <a href={f.anchor_file.html_url} target="_blank" rel="noreferrer">
                  anchors/{f.anchor_day}.jsonl ↗
                </a>{" "}
                {repo ? `in ${repo} ` : ""}before kickoff:
              </p>
              <pre className="codeblock">{f.expected_anchor_line}</pre>
            </div>
          )}

          {f.events.length > 0 && (
            <div className="timeline">
              {f.events.map((e, i) => (
                <div key={i} className={`tl-item ${e.type === "Voided" ? "voided" : ""}`}>
                  <span className="tl-time">{e.at ?? ""}</span>
                  <span>
                    {e.type}
                    {e.details ? ` — ${JSON.stringify(e.details)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {f.canonical_json && (
          <HashProof
            canonicalJson={f.canonical_json}
            storedHash={f.forecast_hash}
            anchorHtmlUrl={f.anchor_file?.html_url ?? null}
            kickoffLabel={dateShort(kickoffUtc)}
          />
        )}
      </div>
    </div>
  );
}

export function VerificationPanel({ v }: { v: Verification }) {
  if (v.forecasts.length === 0) {
    // pre-freeze: show the DISARMED bench — the structure is real, the values arrive at
    // the freeze. No fake data, and the flagship device is visible before launch scrutiny.
    return (
      <div className="card verify-panel">
        <div className="proof-bench">
          <div style={{ display: "grid", gap: "var(--space-4)", minWidth: 0 }}>
            <p className="blurb">
              No official forecast exists for this match yet — every field below is written
              once at the freeze (kickoff−3h) and never edited afterwards.
            </p>
            <dl className="kv">
              <dt>stored hash</dt>
              <dd>— written at freeze</dd>
              <dt>recomputed</dt>
              <dd>— verified server-side on every read</dd>
              <dt>anchored at</dt>
              <dd>— pushed to the public repository before kickoff</dd>
              <dt>model · seed</dt>
              <dd>— recorded with the run</dd>
              <dt>code commit · lockfile</dt>
              <dd>— lineage baked into the container</dd>
            </dl>
          </div>
          <div className="prover">
            <span className="pv-caption">verify in this browser — no server, no trust</span>
            <button type="button" className="btn primary" disabled>
              Prover activates at the freeze
            </button>
            <div className="pv-steps">
              {[
                "canonical bytes assembled",
                "SHA-256 computed in this browser (WebCrypto)",
                "matches the stored write-once hash",
                "anchor entered public history before kickoff",
              ].map((t, i) => (
                <div key={i} className="pv-step">
                  <span className="pv-mark" aria-hidden>
                    ·
                  </span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <p className="blurb" style={{ fontSize: "var(--text-xs)" }}>
              The mechanism is already public:{" "}
              <a
                href="https://github.com/angadk4/KickLens/tree/main/anchors"
                target="_blank"
                rel="noreferrer"
              >
                anchors ↗
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <p className="blurb">
        {v.hash_algorithm}. {v.merkle_algorithm}.
      </p>
      {v.forecasts.map((f) => (
        <Forecast key={f.prediction_id} f={f} repo={v.anchor_repo} kickoffUtc={v.kickoff_utc} />
      ))}
      <p className="blurb">
        Independent check: fetch the anchor file from GitHub (
        {v.forecasts[0]?.anchor_file ? (
          <a href={v.forecasts[0].anchor_file.raw_url} target="_blank" rel="noreferrer">
            raw ↗
          </a>
        ) : (
          "raw"
        )}
        ), find the line above, and confirm it entered the public history before kickoff (
        {dateShort(v.kickoff_utc)}); the daily Merkle root seals the day so the file can't be
        quietly rewritten.
      </p>
    </div>
  );
}
