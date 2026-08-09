// Truncated SHA-256 with copy + optional public-anchor link.
//
// EVERY control here stops its event. All three call sites (FixtureCard, InPlaySection,
// RecordPage) nest this badge inside a card-wide react-router <Link>, whose handler calls
// preventDefault() on the bubbled click — so without stopPropagation the "anchor ↗" link did
// nothing but navigate to the match page, and the copy button's "copied" confirmation was
// destroyed by the unmount. A verification control that silently doesn't verify is worse than
// no control, on this site especially: this is the one-click path from a rendered hash to the
// public anchor repository. (The same idiom is already used by RatingsPage's row buttons.)
import { useEffect, useRef, useState } from "react";
import { shortHash } from "../../lib/format";

export function HashBadge({ hash, href }: { hash: string; href?: string | null }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <span className="hashbadge" title="SHA-256 of the frozen forecast, anchored publicly at creation">
      <span aria-hidden>⬡</span>
      <span className="hash">{shortHash(hash)}</span>
      <button
        type="button"
        onClick={(e) => {
          // preventDefault AND stopPropagation: the first stops the enclosing Link's
          // navigation, the second stops the click ever reaching it
          e.preventDefault();
          e.stopPropagation();
          void navigator.clipboard?.writeText(hash).then(() => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1200);
          });
        }}
        aria-label="Copy full hash"
      >
        {copied ? "copied" : "copy"}
      </button>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          // stopPropagation only — the anchor's OWN default (open the tab) must survive
          onClick={(e) => e.stopPropagation()}
        >
          anchor ↗
        </a>
      )}
    </span>
  );
}
