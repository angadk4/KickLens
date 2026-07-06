import { useEffect, useState } from "react";
import { api, type Methodology as Meth } from "../api";

export function Methodology() {
  const [m, setM] = useState<Meth | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.methodology().then(setM).catch(() => setError(true));
  }, []);

  if (error) return <p className="muted">Could not load methodology.</p>;
  if (m === null) return <p className="muted">Loading…</p>;

  return (
    <article className="methodology">
      <h2>How it works</h2>
      <p>{m.model}.</p>
      <p>{m.cutoff}.</p>
      <h3>Tamper evidence</h3>
      <p>{m.tamper_evidence}.</p>
      <h3>Evidence separation</h3>
      <p>{m.evidence_separation}.</p>
      <h3>Honest limitations</h3>
      <ul>
        {m.honesty_notes.map((note) => (
          <li key={note.slice(0, 24)}>{note}</li>
        ))}
      </ul>
      <h3>Data sources</h3>
      <p>{m.data}.</p>
    </article>
  );
}
