// Truncated SHA-256 with copy + optional public-anchor link.
import { useState } from "react";
import { shortHash } from "../../lib/format";

export function HashBadge({ hash, href }: { hash: string; href?: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="hashbadge" title="SHA-256 of the frozen forecast — anchored publicly at creation">
      <span aria-hidden>⬡</span>
      <span className="hash">{shortHash(hash)}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(hash).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
        aria-label="Copy full hash"
      >
        {copied ? "copied" : "copy"}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noreferrer">
          anchor ↗
        </a>
      )}
    </span>
  );
}
