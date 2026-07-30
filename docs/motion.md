# KickLens motion standard

> The site moves so a reader can *feel* state change — never to decorate. Every rule here
> carries the **measured number** that motivated it, because the previous version of this
> document was the direct cause of a shipped failure and a rule without its number gets
> reverted by the next person who reads it. Tokens live in `apps/web/src/styles/tokens.css`.

## Why this document was rewritten (2026-07-29)

The first motion pass was reviewed by the developer as: *"That barely did anything, I don't
see the ball move, there's no animation, the website still looks dead."* A forensic audit
confirmed it, and the root cause was **this file**:

- Tier 0 was a **count** ("max 4 ambient loops per page"), so four loops that moved nothing
  filled the budget. `drift-a` translated **0.0068px per frame** across a gradient ramping
  0.075 alpha over 630px — a local change of **≈1 of 255 code values across a 96-second
  sweep**, below the 8-bit quantization floor. `drift-b` was worse.
- With the budget nominally "4/4 — adding one means deleting one", the rule was then cited to
  refuse an ambient loop on the hero ball, i.e. the one thing the brief had asked for. The
  ball shipped as a static 20px mark inside a 296px ring, and its only motion was a hover
  rotation — on a circle, which is rotationally symmetric, so nothing visibly moved at all.
- Nothing in the document said an animation had to be **perceptible**. So: `--lift: -2px`,
  `--tilt-max: 3deg` (±2-4px of corner shift), an 8px/250ms reveal, a 1.8px "net ripple", a
  7-of-255 skeleton shimmer, a 3.6px button press, and goal marks stroked at 9% alpha
  (19/255 — also below the 3:1 graphics-contrast floor) all passed review.
- The hero's one orchestrated moment was gated by a `sessionStorage` **read-then-write inside
  a `useMemo`**. StrictMode double-invokes that factory, so pass 2 read the flag pass 1 had
  written and the cascade suppressed itself on **every dev reload** — the developer had
  literally never seen it.

**The correction is the perceptibility floor below.** A budget that counts loops optimizes for
fewer animations; a budget that measures them optimizes for animations you can see.

## The tiers

| Tier | What | Budget | Rules |
|---|---|---|---|
| **0 — Ambient loop** | infinite, non-interactive | **≤6 concurrently animating elements per page, of which ≤3 may exceed 25% of the viewport** — and every one must clear the perceptibility floor | transform/opacity only; viewport-fixed or IO-gated |
| **1 — State transition** | hover / press / focus / class flip | uncapped — only one element is hovered at a time | ≤ `--dur-med`; transform/opacity, plus color/border-color at ≤ `--dur-fast`; elevation changes fade a pseudo-element's opacity, never interpolate a shadow |
| **2 — Entrance** | first appearance or first scroll into view | one reveal per subtree; stagger ≤3 steps × `--stagger` *(exception below)* | ≤ `--dur-reveal`, or longer for self-drawing evidence *(exception below)*; the element must be correct with the animation deleted |
| **3 — Orchestrated moment** | a multi-beat sequence | **one ambient + one event-driven, per site** | ≤1100ms for the ambient one, which runs **once per mount of its page**; the event-driven one may fire **only on a verified state transition** and holds ≤5.3s |
| **4 — Scroll-linked** | progress is a function of scroll position | does **not** consume Tier-0 budget (zero cost when not scrolling, off the main thread when scrolling) | `animation-timeline` only; **`aria-hidden` decorative elements only**; `entry` ranges only |

There is no pointer-linked tier. One was built (a cursor-tracked lamp) and rejected — see
Rejected options.

### THE PERCEPTIBILITY FLOOR

Every ambient (Tier-0) loop must clear one of these:

- a **hard edge** moves **≥2 px/s** for at least 0.5s of each cycle, **or**
- a **soft / gradient** surface changes by **≥2 of 255 code values per second** at its peak.

**A loop below the floor is not "subtle", it is absent.** It still costs a composited layer, a
frame callback and battery, and it buys nothing. Sub-floor loops are **deleted or amplified —
never kept for subtlety.** The same principle applies to interaction amplitudes: below roughly
4px of travel or ~12 of 255 code values, assume nobody can tell.

### The current Tier-0 ledger (home)

`fl-breath` ×3 (two floodlight pools + the haze, counter-phased — one gesture, three
elements) · `ph-roll-x` + `ph-roll-r` + `ph-beat` (**THE BALL** — one object, three transform
layers, because two animations writing `transform` on one element don't compose) · `pulse` +
`pulse-halo` (the single nav health dot) · `ticker-scroll` (IO-gated, pauses on hover).

That is **9 animating elements / 5 gestures**, over the 6-element cap — and the honest
resolution is that the cap counts *gestures on distinct objects*, not CSS animations, because
the ball's three layers are one ball and the floodlights' three are one sky. **5 gestures on
4 objects.** If a sixth object wants ambient motion, something goes.

The two floodlight *drifts* were deleted to pay for the ball; the pools now breathe on
opacity at ~2.0 code values/second instead of translating at 0.011. Measured after the fact
with `.devtools/motion.sh`: **pool swing 8.4 of 255 codes per cycle, ball travel 96.8px per
9s, ticker 71.6 px/s** — every one of them above the floor, and none of them was before.

### Tier 0 on a matchday

The equaliser (`.eq`, three bars at three different durations) is a **conditional** loop: it
exists only while `matchPhase.isLiveNow()` is true for some fixture, and it counts against the
budget only while present.

**Exemptions, stated so they can't be argued later:**
- Loading placeholders (`.skeleton`, the juggling ball) are exempt from the cap **on the
  condition that they are composited-only**.
- Transient loops bounded by an in-flight request (`.btn.busy`'s spinner) don't count.
- A **transient rAF bounded by a single interaction**, running on framer-motion's shared
  frameloop and cancelled the frame it goes to sleep, does not count and does not violate
  rule 7. So is a **one-shot `setTimeout` bounded by a single event** (`HashProof`'s
  `MIN_COMPUTE_MS` already ships as this). Recurring timers remain forbidden.
- A **conditional** loop that exists only during a named live state counts against the budget
  only while it is present.

## The hard rules

1. **Animate `transform` and `opacity`.** Never `background-position`, `width`, `height`,
   `top/left`, `margin`, `filter`, or `box-shadow` values on large surfaces.
2. **Content is never animation-gated.** Every element's base state is its final, readable
   state; an animation only adds a departure the browser returns from. No JS, no IO callback,
   a dropped frame, a backgrounded tab, an unsupported feature — the page is still complete.
   Concretely: reveal keyframes have a `from` block only and **no fill mode**; nothing renders
   `opacity: 0` as a base or inline style.
3. **Reduced motion renders the final state.** The killswitch in `base.css` zeroes duration,
   delay and iteration count, **and reverts `animation-timeline` to `auto`** — that last line
   is the only thing that can stop a scroll-driven animation, whose progress comes from
   position rather than time. Where an animation's *end* state is not the right *static* state
   (a scroll-progress bar would read as "you're at the bottom"), kill it explicitly.
   JS-driven motion consults a **live-subscribing** `matchMedia` — the repo's
   `useMediaQuery("(prefers-reduced-motion: reduce)")`, and **only** that. Neither a one-shot
   `.matches` read **nor framer-motion's `useReducedMotion`** qualifies: framer 12's hook reads
   the preference once at mount and never re-renders on change (verified in its source,
   adversarial review 2026-07-27).
4. **`will-change` is rationed to 2 static elements.** One is spent and named: `.floodlights`
   (its two pool pseudos + the haze). A transient `will-change` set on
   pointerenter and cleared on leave does not consume a slot.
5. **No motion may cause layout.** Anything that appears on hover has its space reserved
   first (`min-height` under the same media query that enables the hide). Split-flap digits
   live in fixed `em` boxes with `overflow: hidden` for exactly this reason.
6. **Every hover affordance has a `:focus-visible` twin**, wired to the same state, plus a
   `@media (hover: none)` path where the content matters.
7. **No new timers.** All motion runs on CSS, framer-motion's single shared frameloop, or the
   shared clock registry (`lib/clock.ts`). No new `setInterval`, no persistent rAF loop (see
   the transient-rAF exemption above).
8. **Reads in render, writes in effects.** A `sessionStorage`/`localStorage` read-then-write
   inside a render function is double-invoked by StrictMode and will see its own write — that
   is precisely how the hero cascade suppressed itself on every dev reload while nobody could
   see it. Read in a `useState` initialiser; write in a `useEffect`. (`lib/oncePerSession.ts`
   used to encode this; it was deleted with the ball's toy, which was its only consumer. The
   rule outlives the helper.)

### The two Tier-3 moments, named

1. **Ambient — the hero cascade** (`.pitch-hero`, 1100ms: halfway line → centre circle → the
   ball drops onto the spot), on every mount of `/`. A chalk ball drew itself along its own
   outline; a solid one cannot, so the fourth beat is a scale-and-fade landing at the same
   1100ms mark. The `↻` replay control was removed with the rest of the hero's interactivity —
   the cascade replaying on every mount is what makes it seeable, and that is enough.
2. **Event-driven — THE SEAL** (`components/layout/Takeover.tsx`, ~2.6s + hold): the gold badge
   strikes, the hash writes itself at 26ms/char, and the ticker strip runs a lower-third. It
   may fire **only** from `lib/liveEvents`' pure diffs, which return `[]` when there is no
   previous snapshot — so it cannot fire on a page load, on a refetch that re-delivers the same
   state, or on arriving at a page where a frozen forecast happens to exist. What it is allowed
   to SAY is decided by `lib/liveCopy`, whose tests assert it never claims "just now" (the
   browser has no creation timestamp, only the cutoff and the publishing run).

**Event ⇒ transient overlay; recency ⇒ persistent chip.** If we did not witness the
transition, we announce nothing and the card carries "sealed 6m ago" instead. That distinction
is the honesty spine of the whole broadcast layer.

### Named exceptions to Tier 2

- **Stagger may exceed 3 steps when the steps ARE the data** — the 90-cell daily-seal strip
  fills at 14ms/cell (1260ms total, under the 1400ms ceiling). `backwards` fill is safe there
  for the same reason the 3-step stagger's is: the keyframe is from-only, so the base state is
  the finished cell.
- **Duration may exceed `--dur-reveal` for self-drawing evidence** (a chart line drawing
  itself), because the drawing is the information. `GoalMark`'s 450ms already set this
  precedent; it is written down now.

## The decision gate (all five must be yes)

1. Does it answer a question the reader is already asking? *(Where did that come from? Did my
   click land? Which row am I on? Is this number big? Did something just happen?)*
2. Transform/opacity only?
3. Does the element read correctly with the animation deleted?
4. Under reduced motion, is it a no-op — not a flash, not a jump, not a false end state?
5. Does it clear the perceptibility floor, and fit its tier's budget?

## Interaction state language

| State | Language |
|---|---|
| Hover | the surface commits: `--line` → `--line-strong`, `--ink-muted` → `--ink`, underline 45% → 100%; cards lift `var(--lift)` **and grow 0.6%** (toward the cursor, so a 6px lift can't slip out from under it) with the float shadow fading in on `::after` |
| Press | fast in, slow out: `translateY(var(--press-y)) scale(var(--press-scale))` over `--dur-press` on `--ease-press`, released over `--dur-release` on `--ease-spring` with one ~7% overshoot. Buttons sit on a 2px plinth that closes up under them |
| Focus | the 2px chalk ring — never removed, never replaced, always in addition to hover styling |
| Disabled | flat, no hover, no press, `cursor: not-allowed` |
| Busy | `aria-disabled` (**not** `disabled` — that drops keyboard focus mid-interaction) + `aria-busy` + `cursor: progress` + the one spinner |

## Elevation on a near-black page

`--shadow-float` used `rgba(4,8,6,0.35)`, which is **darker than `--bg-0` (#0f1813)**. It
powered the entire card-hover float and the nav-scroll cue, and both faded in a ~4-of-255
delta spread across 24px of blur. On dark UI **elevation reads through edge contrast**, so the
load-bearing layer is now a 1px chalk rim (+~18 codes on the card's edge); the black layers
only add depth beneath it. No `inset` — the inset light edge (`--edge-hi`) means "official" on
`.card.stamped`, and hover must not borrow a semantic.

## Rejected options (recorded so they aren't re-proposed)

- **framer `whileInView` / enter-only `initial={{opacity:0}}`** — writes `opacity:0` as an
  inline style cleared from a JS frame; reproduces the "section stuck invisible when frames
  don't run" regression (BUILD_LOG 2026-07, dashboard v2 QA).
- **`AnimatePresence mode="wait"` page transitions** — delays the new page's mount: content
  gated behind animation, verbatim; races `<ScrollRestoration>`.
- **View Transitions API** — snapshots block paint of the new page; `::view-transition-*`
  pseudos aren't matched by the `*` reduced-motion killswitch.
- **Warm metal-halide floodlight flicker** — the most atmospheric idea available, and refused:
  WCAG 2.3.1 caps large-area flashing at 3/second and `.floodlights` is full-viewport, so any
  flicker fast enough to *read* as flicker sits in the photosensitivity hazard band.
- **framer `useScroll` for scroll-linked work** — +6kB gzip, a JS subscription, and it moves
  reduced motion into JS, to do what `animation-timeline` does for 0 bytes off the main thread.
- **A scroll listener** — main-thread work on every scroll event; `base.css` records that
  body-attached fixed gradients "died for it".
- **A cursor-tracked light (2026-07-29).** Built and removed the same day: a warm 520px pool
  that followed the pointer so chalk brightened as if lit, plus a 14px parallax on the
  floodlight pools. The developer rejected it on sight. It was technically clean — one passive
  listener, one rAF, `@property`-registered custom properties, off for touch and reduced
  motion — and that is the point of recording it: **"cheap and well-built" is not an argument
  for keeping something that reads wrong.** A light that chases the cursor makes the page feel
  like a toy surface rather than a board being read. Do not re-propose. (`mix-blend-mode` was
  separately rejected for it: it forces the whole stacking context through a blend pass and
  fights `.topnav`'s `backdrop-filter`.)
- **Content driven by a scroll timeline** — it scrubs backwards, so content would un-reveal on
  scroll-up. Tier 4 is decorative-only for this reason.
- **A kick sound.** CSP does permit a same-origin audio file (there is no `media-src`, so it
  falls back to `default-src 'self'`; `blob:` and generated buffers are blocked). It was
  designed opt-in and default-off behind a footer toggle, and then declined: lowest delight for
  the highest risk of reading as unserious on a credibility-first portfolio piece.
- **A konami / rainbow easter egg.** On a site whose product is credibility, a rainbow is the
  one thing that reads as unserious, and it breaks the closed palette outright. Turning an
  easter egg down is itself a signal.
- **`filter: brightness()` for the floodlight flare** — a paint-only property, so rule 1
  forbade it, and the flare instead multiplied `--fl-gain`, which the base opacity and the
  `fl-breath` keyframe both already read. *The flare itself is gone* (2026-07-30): it fired on
  a hard ball strike, and the ball is no longer strikeable. The technique is kept on the record
  because "multiply a variable both the base rule and the keyframe already read" is the right
  way to surge a composited layer without a second animation on the same property.
- **A minute clock, a live scoreline, goal events, a GOAL lower-third, or an in-play
  win-probability curve.** The API deliberately omits `home_goals`/`away_goals`/minute from
  `/matches/in-play` and `/predictions/completed`, so all of these would be inventing data.
  Nothing in the broadcast layer depends on a backend change.

## THE BALL — a real one, and deliberately untouchable (2026-07-30)

The hero ball was, for one day, a physics toy: click, drag, flick or use the keyboard and it
bounced off the chalk ring and the copy blocks, counted keepy-uppies, and flared the
floodlights on a hard strike. `lib/ballPhysics.ts` was pure, unit-tested on the invariant that
a stepped ball never leaves the ring over 4,000 random states, ran on framer-motion's shared
frameloop, cancelled itself the frame the ball slept, and was correct under reduced motion.

**The developer removed all of it:** *"I dont like the whole keep up all that stuff its gonna
be hard to get it right. Just keep it non interactive but rolling and bouncing how it already
is."* Deleted rather than disabled: `lib/ballPhysics.ts`, `lib/flare.ts`, the hit target, the
hover hop, the hint, the rally counter, the once-per-session self-kick, and the `↻` redraw
control. The `lib/oncePerSession.ts` helper went with them — it had no other consumer.

Recording it because the lesson generalises, and it is the same one the cursor light taught:
**a well-built interaction is still the wrong interaction if the object it is attached to is
not asking to be played with.** The hero is a board being read. An ambient loop earns its place
by being *legible from across the room*; a toy has to earn a much higher bar — it has to be
worth getting right, and a keepy-uppie counter on a forecasting record is not.

What survives is the part that was asked for: it **rolls, spins and bounces**, and it is now a
real black-and-white match ball rather than a chalk drawing of one. That last part is the
site's **only solid object** — an explicit, size-gated exception to the closed chalk vocabulary,
written down in `tokens.css` beside the `--ball-*` tokens: solid at ≥24px in the hero only,
chalk everywhere else (the goal mark's ball is 9 units across, where a patch layout is mush).

The geometry is generated, not eyeballed (`lib/pitchBall.ts`): a truncated icosahedron seen
face-on at a pentagon, which is exactly six visible black patches. The first attempt WAS
eyeballed and read as a five-pointed star, because it drew the outer five at full size — on a
real ball they are tilted 63.435° away from the viewer and foreshorten to 0.447 of their width.
That one cosine is the difference between a sticker and a sphere.

**The rAF exemption in rule 7 now has no consumer on this page.** It stays in the standard
because `HashProof`'s one-shot timeout is the same class of thing, but nothing on home holds a
frame callback any more: the ball is pure CSS, and its travel and rotation cannot desync
because `PitchHero` writes both onto `.ph-cell` from the same two constants.

## Motions that fire only on a favourable outcome

There is exactly one: `gm-ripple`, the net moving when the ball reaches the goal mouth on a
graded card. It is **capped deliberately**, and the cap is the point — it is permitted only
because a net moving when a ball hits it is *physics, not applause*. Everything else about the
graded-card mark is symmetric by construction: the ball's roll starts at the ⅓ baseline tick
on **every** card, and two forecasts equally far from the baseline travel identical distances
in opposite directions (unit-tested in `lib/goalMark.test.ts`). Do not "improve" the ripple.

## Regression log (why rules 2, 3 and 8 are written in blood)

- A section entrance once shipped stuck at `opacity: 0` when IntersectionObserver/framer
  frames didn't run. Fix: entrances are pure CSS class-adds on visible-by-default elements.
- Reduced motion once left `animation-delay` unzeroed — labels appeared late. Fix: the
  killswitch zeroes delay, and delays are only used with `backwards` fill on JS-applied
  classes (the stagger).
- A screenshot once caught the hero countdown invisible because content was animation-gated.
  Fix: rule 2.
- The hero cascade suppressed itself in dev for the entire life of the first motion pass, via
  a `sessionStorage` read-then-write in a `useMemo` under StrictMode. Fix: rule 8, and the
  gate was removed entirely — an animation nobody ever sees is not a feature.
- Two ambient loops held the whole Tier-0 budget while moving ~1 of 255 code values per
  96 seconds. Fix: the perceptibility floor.
