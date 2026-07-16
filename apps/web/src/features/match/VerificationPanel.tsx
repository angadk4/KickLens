// The tamper-evidence showcase: recomputed hash vs stored, the exact public anchor line,
// GitHub links, the daily Merkle root, and a "verify it yourself" recipe.
import type { VerifiedForecast, Verification } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { dateShort } from "../../lib/format";

function Forecast({ f, repo }: { f: VerifiedForecast; repo: string | null }) {
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
        {f.voided && <Badge kind="voided" label="✕ VOIDED (superseded)" />}
      </div>

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
            The canonical document below SHA-256-hashes to the stored value — try it yourself:
          </p>
          <pre className="codeblock">{f.canonical_json}</pre>
          <pre className="codeblock">{`# python
import hashlib; hashlib.sha256(open('forecast.json','rb').read()).hexdigest()`}</pre>
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
  );
}

export function VerificationPanel({ v }: { v: Verification }) {
  if (v.forecasts.length === 0) {
    return (
      <p className="blurb">
        No official forecast exists for this match yet — verification material appears the
        moment one freezes at kickoff−3h.
      </p>
    );
  }
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <p className="blurb">
        {v.hash_algorithm}. {v.merkle_algorithm}.
      </p>
      {v.forecasts.map((f) => (
        <Forecast key={f.prediction_id} f={f} repo={v.anchor_repo} />
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
        ), find the line above, and confirm its commit predates kickoff (
        {dateShort(v.kickoff_utc)}). The Git history is the notary.
      </p>
    </div>
  );
}
