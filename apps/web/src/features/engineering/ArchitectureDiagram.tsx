// The deployed system, drawn to scale of reality: every box exists in Terraform or
// GitHub. Hand-rolled SVG on the site's tokens; native <title> tooltips per node.
// Box geometry, labels and the fit rule live in ./diagramNodes (unit-tested).
//
// Below 720px the 1100-unit canvas cannot be shown honestly — it rendered at 1000px inside
// a 358px column (36% visible) with no affordance and ~580px of mostly-empty canvas. There
// the diagram collapses behind an explicit "view diagram" disclosure and the written
// one-reason-each list becomes the primary content.
import { useMediaQuery } from "../../lib/useMediaQuery";
import { CHIPS, EDGES, LINE_1, LINE_H, NODES, PAD_X } from "./diagramNodes";

/** live media query — the diagram's mobile behaviour is a different composition, not a
    smaller one, so it has to be a render decision rather than a CSS tweak. This local
    hook seeded lib/useMediaQuery; it now just names the breakpoint. */
function useNarrow(): boolean {
  return useMediaQuery("(max-width: 719px)");
}

function DiagramSvg() {
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
          AWS US-EAST-1 · NO VPC
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

        {/* nodes — one <text> per authored line, so nothing runs past a border */}
        {NODES.map((n) => {
          const stacked = n.lines.length > 1 || n.labelTop;
          return (
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
              {n.lines.map((line, i) => (
                <text
                  key={line}
                  className={i === 0 ? undefined : "dg-sub"}
                  x={n.x + PAD_X}
                  y={n.y + (stacked ? LINE_1 + i * LINE_H : n.h / 2 + 4)}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}

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

export function ArchitectureDiagram() {
  const narrow = useNarrow();
  if (!narrow) return <DiagramSvg />;
  return (
    <details className="diagram-toggle">
      <summary>View the architecture diagram (wide canvas, scrolls sideways)</summary>
      <DiagramSvg />
    </details>
  );
}

/** The per-box rationale, reachable on touch and by screen readers (SVG <title>
    tooltips only fire on hover). On narrow screens this list IS the architecture
    section, so it opens by default. */
export function DiagramWhys() {
  const narrow = useNarrow();
  return (
    <details className="blurb diagram-whys" open={narrow || undefined}>
      <summary>Why each box: the one-reason-each list</summary>
      <ul>
        {NODES.map((n) => (
          <li key={n.id}>
            <strong>{n.name ?? n.lines[0]}</strong>: {n.title}
          </li>
        ))}
      </ul>
    </details>
  );
}
