// 404: a lone penalty spot under a faint arc — the one other place pitch geometry
// is licensed. Deliberate geometry, same stroke weight as the hero circle.
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="notfound">
      <svg className="nf-mark" width="140" height="44" viewBox="0 0 140 44" aria-hidden>
        <path
          d="M 10 6 A 88 88 0 0 0 130 6"
          fill="none"
          stroke="var(--chalk-line)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="70" cy="34" r="5" fill="rgba(232, 237, 230, 0.5)" />
      </svg>
      <span className="code">404</span>
      <p>no forecast at this address — and we never back-fill.</p>
      <Link to="/">← back to the overview</Link>
    </div>
  );
}
