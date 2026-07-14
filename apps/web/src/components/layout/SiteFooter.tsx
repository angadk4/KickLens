export function SiteFooter() {
  return (
    <footer className="footer">
      <p>
        Every official forecast is frozen at kickoff−3h, SHA-256 hashed, and anchored to a
        public git repository before the match starts. Nothing is revised, merged, or
        back-filled — ever.
      </p>
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
