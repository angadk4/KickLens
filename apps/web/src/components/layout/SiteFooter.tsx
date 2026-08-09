// Colophon. The latest-seal artifact lives on the Record page now, where verifiers look.
import { Link } from "react-router-dom";
import { ANCHORS_URL, REPO_URL } from "../../lib/facts";

export function SiteFooter() {
  return (
    <footer className="footer">
      <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
        Frozen at kickoff−3h · SHA-256 anchored · never revised ·{" "}
        <Link to="/methodology">how it works</Link>
      </span>
      <div className="footer-links">
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
        <a href={ANCHORS_URL} target="_blank" rel="noreferrer">
          Public anchors ↗
        </a>
        <a href="https://github.com/angadk4" target="_blank" rel="noreferrer">
          Built by Angad Khera ↗
        </a>
      </div>
      <span className="buildline">
        React · FastAPI · AWS Lambda · Neon Postgres · not betting advice
      </span>
      {/* one line for the reader this site is quietly built for — no badge, no banner */}
      <span className="buildline">
        Reviewing this build? <Link to="/engineering">Engineering</Link> is the map:
        invariants, architecture, operations.
      </span>
    </footer>
  );
}
