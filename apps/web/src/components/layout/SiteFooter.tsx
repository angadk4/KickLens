// Colophon + the latest real anchor artifact: one visible Merkle root turns
// "we say it's anchored" into "here is the anchor". Hidden until one exists.
import { Link } from "react-router-dom";
import { api } from "../../api";
import { shortHash } from "../../lib/format";
import { useApi } from "../../lib/useApi";

export function SiteFooter() {
  const merkle = useApi(() => api.merkleRoots(1));
  const latest = merkle.data?.items?.[0];
  return (
    <footer className="footer">
      <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
        Frozen at kickoff−3h · SHA-256 anchored · never revised —{" "}
        <Link to="/methodology">how it works</Link>
      </span>
      {latest && (
        <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--ink-faint)" }}>
          latest sealed day: {latest.day} · merkle {shortHash(latest.root)}
          {latest.anchor_file_html_url && (
            <>
              {" · "}
              <a href={latest.anchor_file_html_url} target="_blank" rel="noreferrer">
                anchor file ↗
              </a>
            </>
          )}
        </span>
      )}
      <div className="footer-links">
        <a href="https://github.com/angadk4/KickLens" target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
        <a
          href="https://github.com/angadk4/KickLens/tree/main/anchors"
          target="_blank"
          rel="noreferrer"
        >
          Public anchors ↗
        </a>
        <a href="https://github.com/angadk4" target="_blank" rel="noreferrer">
          Built by Angad Khera ↗
        </a>
      </div>
      <span className="buildline">
        React · FastAPI · AWS Lambda · Neon Postgres · not betting advice
      </span>
    </footer>
  );
}
