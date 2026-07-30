// THE DOCUMENT THAT GETS HASHED, itemised.
//
// `VerifiedForecast.fields` is the exact 11-key set the SHA-256 is taken over. The API has
// always sent it and the UI has always thrown it away, showing only the canonical JSON blob as
// a <pre>. That blob is the verifiable artifact and it stays — but a reader cannot see from it
// WHICH values are in the hash and which are not, and "nothing else enters the hash" is the
// single most load-bearing claim on the page.
//
// Rendered in canonical sorted-key order, because that IS the order they are hashed in.
import { useEffect, useState } from "react";

/** Fields light up one by one when `assembling` is true — reusing HashProof's own idiom of
    revealing a document before hashing it. `lit` counts up; base state is all-lit, so with
    the animation deleted the ledger is simply complete (motion.md rule 2). */
export function FieldLedger({
  fields,
  assembling = false,
  stepMs = 55,
}: {
  fields: Record<string, unknown>;
  assembling?: boolean;
  stepMs?: number;
}) {
  const keys = Object.keys(fields).sort(); // canonical order = hash order
  const [lit, setLit] = useState(keys.length);

  useEffect(() => {
    if (!assembling) {
      setLit(keys.length);
      return;
    }
    setLit(0);
    // reuses the existing sequencer idiom; a one-shot interval bounded by a single user
    // action, which docs/motion.md rule 7 names as permitted
    const id = setInterval(() => {
      setLit((n) => {
        if (n + 1 >= keys.length) {
          clearInterval(id);
          return keys.length;
        }
        return n + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [assembling, keys.length, stepMs]);

  return (
    <div className="field-ledger">
      <p className="blurb">
        These {keys.length} values, in this order, are the document. Nothing else enters the hash.
      </p>
      <dl>
        {keys.map((k, i) => {
          const on = i < lit;
          const v = fields[k];
          return (
            <div key={k} className={`fl-row${on ? " on" : ""}`}>
              <span className="fl-mark" aria-hidden>
                {on ? "⬡" : "·"}
              </span>
              <dt>{k}</dt>
              <dd>{v === null || v === undefined ? "null" : String(v)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** The pre-freeze twin: the field NAMES with no values, so the bench is credible before there
    is anything to verify. Enormous credibility, zero data. */
export function FieldLedgerPending({ names }: { names: string[] }) {
  return (
    <div className="field-ledger pending">
      <p className="blurb">
        These {names.length} values will be the document. Nothing else enters the hash.
      </p>
      <dl>
        {[...names].sort().map((k) => (
          <div key={k} className="fl-row">
            <span className="fl-mark" aria-hidden>
              ·
            </span>
            <dt>{k}</dt>
            <dd>— written at the freeze</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
