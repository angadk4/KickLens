# KickLens motion standard

> The site moves so a reader can *feel* state change — never to decorate. Every rule here
> exists because a violation was either shipped and hurt (see the regression log at the
> bottom) or measured and rejected. Tokens live in `apps/web/src/styles/tokens.css`.

## The four tiers

| Tier | What | Budget | Rules |
|---|---|---|---|
| **0 — Ambient loop** | infinite, non-interactive (floodlight drift, ticker, pulse) | **max 4 concurrent per page** | transform/opacity only; viewport-fixed or IO-gated; adding a 5th means deleting one |
| **1 — State transition** | hover / press / focus / class flip | uncapped — only one element is hovered at a time | ≤ `--dur-med`; transform/opacity, plus color/border-color at ≤ `--dur-fast`; shadow changes fade a pseudo-element's opacity, never interpolate a shadow |
| **2 — Entrance** | first appearance or first scroll into view | one reveal per subtree; stagger ≤ 3 steps × `--stagger` | ≤ `--dur-reveal`; the element must be correct with the animation deleted |
| **3 — Orchestrated moment** | the hero chalk draw (line → circle → spot → ball) | **exactly one per site — already spent** | once per session (`sessionStorage`), ≤ 1600ms |

### The current Tier-0 ledger (the cap is at 4 on home)

`drift-a` + `drift-b` (floodlights, viewport-fixed) · `pulse` (nav health dot only —
"one pulse means something") · `ticker-scroll` (home only, IO-gated, pauses on hover).

**Exemptions, stated so they can't be argued later:**
- Loading placeholders (`.skeleton`) are exempt from the cap **on the condition that they are
  composited-only** (`translateX` sweep, never `background-position`).
- Transient loops bounded by an in-flight request (the one `spin` definition on `.btn.busy`)
  don't count.

## The hard rules

1. **Animate `transform` and `opacity`.** Never `background-position`, `width`, `height`,
   `top/left`, `margin`, `filter`, or `box-shadow` values on large surfaces.
2. **Content is never animation-gated.** Every element's base state is its final, readable
   state; an animation only adds a departure the browser returns from. No JS, no IO callback,
   a dropped frame, a backgrounded tab — the page is still complete. Concretely: reveal
   keyframes have a `from` block only and **no fill mode**; nothing renders `opacity: 0` as
   a base or inline style.
3. **Reduced motion renders the final state.** The global killswitch (`base.css`) zeroes
   duration, delay and iteration count. JS-driven motion consults a **live-subscribing**
   `matchMedia` — the repo's `useMediaQuery("(prefers-reduced-motion: reduce)")`, and
   ONLY that. Neither a one-shot `.matches` read **nor framer-motion's
   `useReducedMotion`** qualifies: framer 12's hook reads the preference once at mount
   and never re-renders on change (verified in its source — adversarial review
   2026-07-27).
4. **`will-change` is rationed to 2 static elements** (currently 1: `.floodlights`).
   A transient `will-change` set on pointerenter and cleared on pointerleave doesn't
   consume a slot.
5. **No motion may cause layout.** Anything that appears on hover has its space reserved
   first (`min-height` under the same media query that enables the hide).
6. **Every hover affordance has a `:focus-visible` twin**, wired to the same state.
7. **No new timers.** All motion runs on CSS, framer-motion's single shared frameloop, or
   the shared clock registry (`lib/clock.ts`). No new `setInterval`, no persistent rAF loop.

## The decision gate (all five must be yes)

1. Does it answer a question the reader is already asking? *(Where did that come from? Did
   my click land? Which row am I on? Is this number big?)*
2. Transform/opacity only?
3. Does the element read correctly with the animation deleted?
4. Under reduced motion, is it a no-op — not a flash, not a jump?
5. Does it fit its tier's budget? If Tier 0 and the page runs 4: what are you deleting?

## Interaction state language

| State | Language |
|---|---|
| Hover | the surface commits: `--line` → `--line-strong`, `--ink-muted` → `--ink`, underline 45% → 100%; cards lift `var(--lift)` with the float shadow fading in on `::after` |
| Press | the element returns to the page: `scale(0.98)` on buttons, `translateY(0)` on lifted cards |
| Focus | the 2px chalk ring — never removed, never replaced, always in addition to hover styling |
| Disabled | flat `--bg-2` / `--ink-muted`, no hover, no press, `cursor: default` |
| Busy | disabled + `cursor: progress` + `aria-busy` + the one spinner |

## Rejected options (recorded so they aren't re-proposed)

- **framer `whileInView` / enter-only `initial={{opacity:0}}`** — writes `opacity:0` as an
  inline style cleared from a JS frame; reproduces the "section stuck invisible when frames
  don't run" regression (BUILD_LOG 2026-07: dashboard v2 QA).
- **`AnimatePresence mode="wait"` page transitions** — delays the new page's mount: content
  gated behind animation, verbatim; races `<ScrollRestoration>`.
- **View Transitions API** — snapshots block paint of the new page; `::view-transition-*`
  pseudos aren't matched by the `*` reduced-motion killswitch; support uneven.

## Regression log (why rules 2 and 3 are written in blood)

- A section entrance once shipped stuck at `opacity: 0` when IntersectionObserver/framer
  frames didn't run. Fix: entrances are pure CSS class-adds on visible-by-default elements.
- Reduced-motion once left `animation-delay` unzeroed — labels appeared late. Fix: the
  killswitch zeroes delay, and delays are only used with `backwards` fill on JS-applied
  classes (the stagger).
- A screenshot once caught the hero countdown invisible because content was animation-gated.
  Fix: rule 2.
