// Architecture-diagram geometry + label data, kept out of the component file so the box
// data and its fit rule can be unit-tested (and so fast refresh stays intact).
//
// THE LAYOUT RULE: no glyph may sit within PAD_X of its box border. Seven captions used to
// run straight out through the right-hand stroke (worst by 43px) because labels were single
// long strings measured against nothing. They are now authored as LINES sized against the
// box, and `fitsBox` makes the rule executable — see ArchitectureDiagram.test.ts.
import { CRON_RULES, TESTS_CI_PASSED } from "../../lib/facts";

export type DiagramNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** line 0 is the title (TITLE_FS); the rest are sub-lines (SUB_FS) */
  lines: string[];
  /** prose name for the one-reason-each list, where line breaks don't apply */
  name?: string;
  /** tall boxes label at their top edge so contents never overprint the title */
  labelTop?: boolean;
  gold?: boolean;
  title: string;
};

/** IBM Plex Mono advances exactly 0.6em per glyph — verified against getBBox() in-page. */
export const MONO_ADV = 0.6;
export const TITLE_FS = 11;
export const SUB_FS = 10.5;
export const PAD_X = 12;
export const LINE_1 = 19; // first baseline, measured from the box top
export const LINE_H = 15;

/** width a line of text will actually occupy */
export function textWidth(s: string, fontSize: number): number {
  return s.length * fontSize * MONO_ADV;
}

/** true when every line clears the border by at least PAD_X and the box is tall enough */
export function fitsBox(n: {
  w: number;
  h: number;
  lines: string[];
  labelTop?: boolean;
}): boolean {
  const inner = n.w - 2 * PAD_X;
  const widthsOk = n.lines.every((l, i) => textWidth(l, i === 0 ? TITLE_FS : SUB_FS) <= inner);
  const stacked = n.lines.length > 1 || n.labelTop;
  const needed = stacked ? LINE_1 + (n.lines.length - 1) * LINE_H + 8 : 24;
  return widthsOk && n.h >= needed;
}

export const NODES: DiagramNode[] = [
  { id: "g1", x: 30, y: 70, w: 210, h: 60,
    lines: ["GitHub Actions · CI", `ruff · mypy · ${TESTS_CI_PASSED} tests`, "against a real Postgres"],
    title: "CI spins up a real postgres:18 service so the DB-backed guarantees run, not skip. A final step re-runs the never-cut suites and fails if they silently skipped." },
  { id: "g2", x: 30, y: 150, w: 210, h: 60,
    lines: ["GitHub Actions · Deploy", "job image → ECR · API zip", "site → S3 · terraform apply"],
    title: "One push to main: image built and tagged with the commit SHA, all six functions repointed to it; API zip updated; site synced + CloudFront invalidated; terraform apply for drift." },
  { id: "g3", x: 30, y: 230, w: 210, h: 60, name: "GitHub Actions · monthly train",
    lines: ["GitHub Actions · train", "monthly · challenger only", "never auto-promoted"],
    title: "Runs the 1st of each month. Produces a challenger; promotion is manual behind a frozen gate (≥0.005 nats, a 95% CI excluding 0, and calibration not degraded)." },
  { id: "g4", x: 30, y: 480, w: 210, h: 60, gold: true,
    lines: ["Public anchor files", "anchors/YYYY-MM-DD.jsonl", "+ daily Merkle root"],
    title: "The notary: every official forecast's SHA-256 lands here before kickoff; a daily Merkle root seals each day. The Git history proves the timing." },
  /* y=8, not 16: the taller two-line box would otherwise sit on the AWS zone label */
  { id: "p1", x: 320, y: 8, w: 450, h: 46,
    name: "Providers · football-data.co.uk · Highlightly · SportsGameOdds",
    lines: ["Providers", "football-data.co.uk · Highlightly · SportsGameOdds"],
    title: "Fixtures, results, and closing odds. A total provider outage raises so the Errors alarm fires; silent degradation was audited out." },
  { id: "u1", x: 950, y: 16, w: 120, h: 40,
    lines: ["Browser"],
    title: "This site. Static React bundle; every metric arrives with its evidence scope and sample size." },
  { id: "a1", x: 330, y: 80, w: 430, h: 62,
    lines: [
      `EventBridge · ${CRON_RULES} cron rules`,
      "ingest 08/20 + results 01–06 · feature :10 · inference :20",
      "grade 2h · merkle 12:00 · odds :05 · canary 09:00",
    ],
    title: "Schedule state is ENABLED in code, so a terraform apply can never silently disarm the live loop. Counted down live on the operations board below." },
  { id: "a2", x: 330, y: 172, w: 430, h: 130, labelTop: true,
    lines: ["one container image · ECR · GIT_SHA baked"],
    title: "≈1.3 GB image with the ML stack, six handlers, timeouts 120–300s. The git SHA is baked at build time, because Lambda has no git binary and lineage must never degrade to 'unknown'." },
  { id: "a5", x: 830, y: 92, w: 240, h: 46,
    lines: ["S3 + CloudFront", "static dashboard (OAC)"],
    title: "No public bucket. CloudFront Origin Access Control only." },
  { id: "a3", x: 830, y: 172, w: 240, h: 46,
    lines: ["API Gateway HTTP API", "GET only · 20 rps"],
    title: "Read-only public surface, throttled at 20 rps / burst 40." },
  { id: "a4", x: 830, y: 252, w: 240, h: 60,
    lines: ["API Lambda · 8 MB zip", "FastAPI · no ML libs", "Cache-Control on reads"],
    title: "The public API carries no ML dependencies so it cold-starts fast; response caching protects the scale-to-zero database." },
  { id: "n1", x: 830, y: 340, w: 240, h: 60,
    lines: ["Neon Postgres", "pooled (PgBouncer)", "scale-to-zero · no VPC"],
    title: "Lambda runs outside any VPC, so no NAT gateway. Write-once triggers on the prediction ledger; 30-way connection burst verified with 0 errors." },
  { id: "a6", x: 330, y: 480, w: 240, h: 60,
    lines: ["CloudWatch · 13 alarms", "errors + throttles per job", "api 5xx at threshold 1"],
    title: "Errors AND Throttles per job (a throttled job never runs, so it never errors) plus API 5xx at threshold 1." },
  { id: "a7", x: 620, y: 480, w: 140, h: 48,
    lines: ["SNS → email"],
    title: "Every alarm lands in the developer's inbox. The daily canary raising IS the alerting mechanism." },
  { id: "a8", x: 330, y: 566, w: 240, h: 48,
    lines: ["SSM Parameter Store", "secrets (SecureString)"],
    title: "Free tier over Secrets Manager; config read at cold start, never logged." },
];

export const CHIPS = ["ingest", "feature", "inference", "grade", "odds", "canary"];

export type DiagramEdge = {
  d: string;
  label?: string;
  lx?: number;
  ly?: number;
  dashed?: boolean;
};

export const EDGES: DiagramEdge[] = [
  { d: "M 545 142 L 545 172", label: "invokes", lx: 553, ly: 164 },
  { d: "M 760 250 L 830 356", label: "leased job claims + state gates", lx: 590, ly: 330 },
  { d: "M 545 54 L 545 80", label: "fixtures · results · odds", lx: 553, ly: 74 },
  { d: "M 330 290 L 240 490", label: "hash pushed before kickoff", lx: 130, ly: 400 },
  { d: "M 240 506 C 290 560, 380 560, 430 302", label: "grade reads the public file → merkle root", lx: 40, ly: 620, dashed: true },
  { d: "M 1010 56 L 1010 92", label: "HTML/JS", lx: 1018, ly: 78 },
  { d: "M 1064 56 C 1088 110, 1088 145, 1072 176", label: "API calls", lx: 1002, ly: 158 },
  { d: "M 950 218 L 950 252" },
  { d: "M 950 312 L 950 340", label: "read-only SQL", lx: 958, ly: 330 },
  { d: "M 480 302 L 450 480", label: "logs · metrics", lx: 400, ly: 400, dashed: true },
  { d: "M 830 292 C 700 380, 560 420, 500 480", dashed: true },
  { d: "M 570 504 L 620 504", label: "alarm", lx: 578, ly: 498 },
  { d: "M 450 566 L 500 302", label: "config at cold start", lx: 470, ly: 558, dashed: true },
  { d: "M 240 168 C 290 180, 310 210, 330 245", label: "image @ commit SHA", lx: 244, ly: 156 },
  { d: "M 240 184 C 500 380, 700 300, 830 278", label: "zip", lx: 300, ly: 230 },
  /* deploy → S3: unlabeled — the Deploy node's own sub-line already says "site → S3" */
  { d: "M 240 158 C 560 56, 700 76, 830 110" },
  /* was (330, 300) — printed straight across the container box's bottom rows */
  { d: "M 240 258 C 560 420, 700 400, 830 372", label: "manual promotion only", lx: 258, ly: 352, dashed: true },
];
