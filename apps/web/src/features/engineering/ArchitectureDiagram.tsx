// The deployed system, drawn to scale of reality: every box exists in Terraform or
// GitHub. Hand-rolled SVG on the site's tokens; native <title> tooltips per node;
// horizontally scrollable on narrow viewports rather than reflowed.

type Node = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  l1: string;
  l2?: string;
  l3?: string;
  /** tall boxes label at their top edge so contents never overprint the title */
  labelTop?: boolean;
  gold?: boolean;
  title: string;
};

const NODES: Node[] = [
  { id: "g1", x: 30, y: 70, w: 210, h: 46, l1: "GitHub Actions — CI", l2: "ruff · mypy · 194 tests vs Postgres", title: "CI spins up a real postgres:18 service so the DB-backed guarantees run, not skip. A final step re-runs the never-cut suites and fails if they silently skipped." },
  { id: "g2", x: 30, y: 150, w: 210, h: 46, l1: "GitHub Actions — Deploy", l2: "job image → ECR · API zip · site → S3", title: "One push to main: image built and tagged with the commit SHA, all six functions repointed to it; API zip updated; site synced + CloudFront invalidated; terraform apply for drift." },
  { id: "g3", x: 30, y: 230, w: 210, h: 46, l1: "GitHub Actions — monthly train", l2: "challenger only — never auto-promoted", title: "Runs the 1st of each month. Produces a challenger; promotion is manual behind a frozen gate (≥0.005 nats and the 95% CI excluding 0)." },
  { id: "g4", x: 30, y: 480, w: 210, h: 52, l1: "Public anchor files", l2: "anchors/YYYY-MM-DD.jsonl + Merkle", gold: true, title: "The notary: every official forecast's SHA-256 lands here before kickoff; a daily Merkle root seals each day. The Git history proves the timing." },
  { id: "p1", x: 330, y: 16, w: 430, h: 40, l1: "Providers — football-data.co.uk · Highlightly · SportsGameOdds", title: "Fixtures, results, and closing odds. A total provider outage raises so the Errors alarm fires — silent degradation was audited out." },
  { id: "u1", x: 950, y: 16, w: 120, h: 40, l1: "Browser", title: "This site. Static React bundle; every metric arrives with its evidence scope and sample size." },
  { id: "a1", x: 330, y: 80, w: 430, h: 62, l1: "EventBridge — 8 cron rules", l2: "ingest 08/20 · feature :10 · inference :20 · grade 2h", l3: "merkle 12:00 · odds :05 · canary 09:00", title: "Schedule state is ENABLED in code, so a terraform apply can never silently disarm the live loop." },
  { id: "a2", x: 330, y: 172, w: 430, h: 130, l1: "one container image · ECR · GIT_SHA baked", labelTop: true, title: "≈1.3 GB image with the ML stack, six handlers, timeouts 120–300s. The git SHA is baked at build time — Lambda has no git binary, and lineage must never degrade to 'unknown'." },
  { id: "a5", x: 830, y: 92, w: 240, h: 46, l1: "S3 + CloudFront", l2: "static dashboard (OAC)", title: "No public bucket — CloudFront Origin Access Control only." },
  { id: "a3", x: 830, y: 172, w: 240, h: 46, l1: "API Gateway HTTP API", l2: "GET only · 20 rps", title: "Read-only public surface, throttled at 20 rps / burst 40." },
  { id: "a4", x: 830, y: 252, w: 240, h: 46, l1: "API Lambda — 8 MB zip", l2: "FastAPI · no ML libs · Cache-Control", title: "The public API carries no ML dependencies so it cold-starts fast; response caching protects the scale-to-zero database." },
  { id: "n1", x: 830, y: 340, w: 240, h: 56, l1: "Neon Postgres", l2: "pooled (PgBouncer) · scale-to-zero", title: "Lambda runs outside any VPC — no NAT gateway. Write-once triggers on the prediction ledger; 30-way connection burst verified with 0 errors." },
  { id: "a6", x: 330, y: 480, w: 240, h: 48, l1: "CloudWatch — 13 alarms", l2: "errors + throttles · api thr = 1", title: "Errors AND Throttles per job (a throttled job never runs, so it never errors) plus API 5xx at threshold 1." },
  { id: "a7", x: 620, y: 480, w: 140, h: 48, l1: "SNS → email", title: "Every alarm lands in the developer's inbox. The daily canary raising IS the alerting mechanism." },
  { id: "a8", x: 330, y: 566, w: 240, h: 40, l1: "SSM Parameter Store", l2: "secrets (SecureString)", title: "Free tier over Secrets Manager; config read at cold start, never logged." },
];

const CHIPS = ["ingest", "feature", "inference", "grade", "odds", "canary"];

type Edge = { d: string; label?: string; lx?: number; ly?: number; dashed?: boolean };

const EDGES: Edge[] = [
  { d: "M 545 142 L 545 172", label: "invokes", lx: 553, ly: 164 },
  { d: "M 760 250 L 830 356", label: "leased job claims + state gates", lx: 590, ly: 330 },
  { d: "M 545 56 L 545 80", label: "fixtures · results · odds", lx: 553, ly: 72 },
  { d: "M 330 290 L 240 490", label: "hash pushed before kickoff", lx: 130, ly: 400 },
  { d: "M 240 506 C 290 560, 380 560, 430 302", label: "grade reads the public file → merkle root", lx: 40, ly: 620, dashed: true },
  { d: "M 1010 56 L 1010 92", label: "HTML/JS", lx: 1018, ly: 78 },
  { d: "M 1064 56 C 1088 110, 1088 145, 1072 176", label: "API calls", lx: 1002, ly: 158 },
  { d: "M 950 218 L 950 252" },
  { d: "M 950 298 L 950 340", label: "read-only SQL", lx: 958, ly: 324 },
  { d: "M 480 302 L 450 480", label: "logs · metrics", lx: 400, ly: 400, dashed: true },
  { d: "M 830 292 C 700 380, 560 420, 500 480", dashed: true },
  { d: "M 570 504 L 620 504", label: "alarm", lx: 578, ly: 498 },
  { d: "M 450 566 L 500 302", label: "config at cold start", lx: 470, ly: 545, dashed: true },
  { d: "M 240 168 C 290 180, 310 210, 330 245", label: "image @ commit SHA", lx: 244, ly: 156 },
  { d: "M 240 184 C 500 380, 700 300, 830 278", label: "zip", lx: 300, ly: 230 },
  /* deploy → S3: unlabeled — the Deploy node's own sub-line already says "site → S3" */
  { d: "M 240 158 C 560 56, 700 76, 830 110" },
  { d: "M 240 258 C 560 420, 700 400, 830 372", label: "manual promotion only", lx: 330, ly: 300, dashed: true },
];

export function ArchitectureDiagram() {
  return (
    <div className="diagram-scroll">
      <svg
        className="diagram"
        viewBox="0 0 1100 640"
        role="img"
        aria-label="Architecture: GitHub Actions build and deploy to AWS; EventBridge crons invoke six Lambda handlers from one container image against Neon Postgres; forecasts are anchored to public GitHub; CloudWatch alarms email the developer; the browser reads a static dashboard through API Gateway."
      >
        <defs>
          <marker
            id="dg-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--line-strong)" />
          </marker>
        </defs>

        {/* zones */}
        <rect className="dg-zone" x="16" y="52" width="238" height="500" rx="8" />
        <text className="dg-zone-label" x="30" y="44">
          GITHUB
        </text>
        <rect className="dg-zone" x="310" y="76" width="780" height="546" rx="8" />
        <text className="dg-zone-label" x="324" y="70">
          AWS US-EAST-1 — NO VPC
        </text>

        {/* edges under nodes */}
        {EDGES.map((e, i) => (
          <g key={i}>
            <path className={`dg-edge${e.dashed ? " dashed" : ""}`} d={e.d} />
            {e.label && (
              <text className="dg-edge-label" x={e.lx} y={e.ly}>
                {e.label}
              </text>
            )}
          </g>
        ))}

        {/* nodes */}
        {NODES.map((n) => (
          <g key={n.id} className="dg-node" tabIndex={0}>
            <title>{n.title}</title>
            <rect
              className={`dg-box${n.gold ? " gold" : ""}`}
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={6}
            />
            <text x={n.x + 12} y={n.y + (n.l2 || n.labelTop ? 19 : n.h / 2 + 4)}>
              {n.l1}
            </text>
            {n.l2 && (
              <text className="dg-sub" x={n.x + 12} y={n.y + 36}>
                {n.l2}
              </text>
            )}
            {n.l3 && (
              <text className="dg-sub" x={n.x + 12} y={n.y + 50}>
                {n.l3}
              </text>
            )}
          </g>
        ))}

        {/* the six handlers inside the container box */}
        {CHIPS.map((c, i) => {
          const cx = 348 + (i % 3) * 135;
          const cy = 210 + Math.floor(i / 3) * 44;
          return (
            <g key={c}>
              <rect className="dg-chip" x={cx} y={cy} width={118} height={30} rx={5} />
              <text x={cx + 12} y={cy + 19}>
                {c}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The per-box rationale, reachable on touch and by screen readers (SVG <title>
    tooltips only fire on hover). */
export function DiagramWhys() {
  return (
    <details className="blurb">
      <summary>Why each box — the one-reason-each list</summary>
      <ul>
        {NODES.map((n) => (
          <li key={n.id}>
            <strong>{n.l1}</strong> — {n.title}
          </li>
        ))}
      </ul>
    </details>
  );
}
