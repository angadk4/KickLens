// "What would you have said?" — the site's most recognisable component turned into a control.
//
// The interaction: two draggable cuts on one bar, so the three probabilities are differences
// and sum to exactly 1 by construction (lib/yourCall). While you drag, it shows what you would
// score for EACH possible outcome — you feel the trade-off before you know the answer, which
// is the entire point of a proper scoring rule and the thesis of this whole site.
//
// The controls are two visually-hidden native <input type="range">. That is not laziness: it
// buys full keyboard operability (arrows, Home/End, PageUp/Down), native touch thumb
// behaviour, and aria-valuetext, none of which a div could have for free.
//
// SIX FIREWALLS keep it off the record: (1) no new Scope value, (2) no ScopeChip, (3) no
// --scope-* colour, (4) a literal "not on the record" label, (5) it never shares a <Section>
// with a live-scope figure and is mounted only on /calibration, and (6) the API is read-only
// and CSP sets form-action 'none', so it is *physically* unable to write anywhere. The caveat
// and the scope note come from describeCall(), which cannot return one without the other.
import { useEffect, useRef, useState } from "react";
import type { CompletedItem } from "../../api";
import { pct, teamName } from "../../lib/format";
import {
  conditionalLosses,
  describeCall,
  logLoss,
  splitFromCuts,
  type Outcome,
  type Split,
} from "../../lib/yourCall";

const RESULT_LABEL: Record<Outcome, string> = {
  H: "home win",
  D: "draw",
  A: "away win",
};

/** Same 7-glyph label budget ProbBar measured ("D 26.0%" at --text-xs mono). */
const LABEL_PX = 58;

/** The H|D|A bar, with ProbBar's geometry discipline rather than its own.
    `flexBasis: 0` is the load-bearing part: the segments inherited `flex-basis: auto`, so each
    one's base was its own ~53px label and only the LEFTOVER was distributed by grow — a bar
    labelled 45.0 / 27.0 / 28.0 rendered 39.2 / 30.4 / 30.4 on mobile. Compression toward
    uniform can never flip the ranking and never overstates confidence, but this is the widget
    on the page whose entire argument is that a probability means exactly what it says.
    Measuring also lets a segment too narrow for its label render none, instead of clipping to
    an ambiguous fragment like "5." that still reads as a numeral. */
function YcBar({ p, ghost }: { p: { pH: number; pD: number; pA: number }; ghost?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const segs = [
    { key: "home", label: "H", v: p.pH },
    { key: "draw", label: "D", v: p.pD },
    { key: "away", label: "A", v: p.pA },
  ];
  return (
    <div ref={ref} className={`yc-bar${ghost ? " ghost" : ""}`} aria-hidden>
      {segs.map((s) => (
        <span
          key={s.key}
          className={`yc-seg ${s.key}`}
          style={{ flexGrow: Math.max(s.v, 0.001), flexBasis: 0 }}
        >
          {width > 0 && s.v * width >= LABEL_PX ? `${s.label} ${pct(s.v)}` : ""}
        </span>
      ))}
    </div>
  );
}

export function YourCall({ matches }: { matches: CompletedItem[] }) {
  // the fixture is chosen by a stated RULE, never a pick: most recent graded first
  const [idx, setIdx] = useState(0);
  const [cutA, setCutA] = useState(45);
  const [cutB, setCutB] = useState(72);
  const [revealed, setRevealed] = useState(false);
  /** the split as it stood when you pressed reveal — see the note beside describeCall */
  const [committed, setCommitted] = useState<Split | null>(null);

  const m = matches[idx];
  if (!m) return null;

  const yours = splitFromCuts(cutA / 100, cutB / 100);
  const model = { pH: m.p_home, pD: m.p_draw, pA: m.p_away };
  const result = m.result as Outcome;
  const mine = conditionalLosses(yours);
  const theirs = conditionalLosses(model);
  // THE CALL IS FROZEN AT REVEAL. Scoring the live slider values would let you keep dragging
  // after the answer is on screen until it reads "You beat the model" — which is exactly the
  // hindsight this page exists to argue against, and it would make the verdict meaningless.
  // Committing on reveal is the same discipline the product applies to itself at kickoff−3h.
  const v = describeCall({ yours: committed ?? yours, model, result, n: 1 });

  const move = (next: number, which: "a" | "b") => {
    if (which === "a") setCutA(next);
    else setCutB(next);
  };

  return (
    <div className="your-call">
      <div className="yc-head">
        <span className="yc-tag">not on the record</span>
        <span className="yc-fixture">
          {teamName(m.home)} vs {teamName(m.away)}
        </span>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            setIdx((i) => (i + 1) % matches.length);
            setRevealed(false);
            setCommitted(null);
          }}
        >
          another match
        </button>
      </div>

      {/* the editable bar. The visible segments are decorative; the two range inputs are the
          real controls and stack BELOW them (.your-call is a grid, not a stacking overlay). */}
      <YcBar p={yours} />

      {/* Each slider's RANGE is bounded by the other, so they can never cross. Without this the
          cuts sort themselves inside splitFromCuts and the two sliders silently swap roles: drag
          the first past the second and it starts controlling the away edge, while its label still
          says home/draw. The accessible name is static; the changing value goes in
          aria-valuetext, which is what screen readers re-read on each step. */}
      <div className="yc-cuts">
        <label>
          <span className="sr-only">Home / draw split</span>
          <input
            type="range"
            min={1}
            max={cutB - 1}
            step={1}
            value={cutA}
            disabled={revealed}
            onChange={(e) => move(Number(e.target.value), "a")}
            aria-valuetext={`home ${pct(yours.pH)}, draw ${pct(yours.pD)}, away ${pct(yours.pA)}`}
          />
        </label>
        <label>
          <span className="sr-only">Draw / away split</span>
          <input
            type="range"
            min={cutA + 1}
            max={99}
            step={1}
            value={cutB}
            disabled={revealed}
            onChange={(e) => move(Number(e.target.value), "b")}
            aria-valuetext={`home ${pct(yours.pH)}, draw ${pct(yours.pD)}, away ${pct(yours.pA)}`}
          />
        </label>
      </div>

      {/* what you would score for each possible outcome — the trade-off, before the answer */}
      <dl className="yc-conditional">
        {mine.map((c) => (
          <div key={c.outcome}>
            <dt>{c.label} →</dt>
            <dd>{c.loss.toFixed(4)}</dd>
          </div>
        ))}
      </dl>

      {!revealed ? (
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setCommitted(yours); // commit BEFORE revealing — no dragging after the answer
            setRevealed(true);
          }}
        >
          Show what the model said, and what happened
        </button>
      ) : (
        <div className="yc-reveal">
          <YcBar p={model} ghost />
          <p className="yc-line">
            the frozen official forecast · it scored{" "}
            <strong className="mono">{logLoss(model, result).toFixed(4)}</strong>
            {"  "}
            <span className="yc-dim">
              ({theirs.map((c) => `${c.label} → ${c.loss.toFixed(2)}`).join(" · ")})
            </span>
          </p>
          <dl className="yc-scores">
            <div>
              <dt>you</dt>
              <dd>{v.yours}</dd>
            </div>
            <div>
              <dt>the model</dt>
              <dd>{v.model}</dd>
            </div>
            <div>
              <dt>knew nothing</dt>
              <dd>{v.baseline}</dd>
            </div>
          </dl>
          <p className="yc-line">
            it finished a <strong>{RESULT_LABEL[result]}</strong>. {v.verdict}
          </p>
        </div>
      )}

      {/* mandatory, and it comes from the library rather than this file */}
      <p className="yc-scope">{v.scopeNote}</p>
    </div>
  );
}
