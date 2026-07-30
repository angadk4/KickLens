// The ball's contract with the hero:
//   1. the resting ball never touches the copy, and the rolling ball never touches the ring;
//   2. its travel and its rotation agree, or it skids instead of rolling;
//   3. it is a BALL — five-fold symmetric patches, cut by the outline;
//   4. it is NOT INTERACTIVE. The developer removed the kickable toy explicitly, so that is
//      asserted here rather than left to memory: the hero renders no control of any kind.
//
// ⚠ THE BAND GUARDRAIL CHANGED, DELIBERATELY AND LOUDLY. This file used to assert
// `fitsBand(15) === false`, which was true of the OLD band (134-162, a 28-unit gap set by
// .ph-top's 16px and .ph-bottom's 12px padding). Those two paddings are now --space-5 (24px),
// so the band is 126-174 (48 units) and the same *constraint* now admits r=16. The rule has
// not been weakened — it is still "the resting ball never touches the copy", still measured
// against the CSS, and it still has a tripwire above the shipped value (fitsBand(24)).
import { describe, expect, it } from "vitest";
// ?raw rather than node:fs: no @types/node in a browser tsconfig. NOTE that this only works
// for the .tsx — Vitest returns "" for a .css?raw import, which is why the CSS coupling is
// enforced structurally (see below) instead of by reading the stylesheet.
import hero from "../features/home/PitchHero.tsx?raw";
import {
  BALL_CX,
  BALL_CY,
  BALL_R,
  ballPatches,
  ballSeams,
  BAND_BOTTOM,
  BAND_TOP,
  beatPhaseMs,
  BEAT_RISE,
  BEAT_STRETCH,
  bandTopFor,
  fitsBand,
  fitsBeat,
  PATCH_C_R,
  PH_TOP_PADDINGS,
  PATCH_RIM_D,
  PATCH_RIM_R,
  PATCH_RIM_SQUASH,
  pentagonPath,
  pentagonPoints,
  PLAY_R,
  rimPatchCentres,
  rimPatchPoints,
  ringClearance,
  rollDegrees,
  ROLL_X,
} from "./pitchBall";

const dist = (p: { x: number; y: number }) => Math.hypot(p.x - BALL_CX, p.y - BALL_CY);

describe("pitchBall geometry", () => {
  it("the shipped radius fits the band; a bigger ball must not", () => {
    expect(fitsBand(BALL_R)).toBe(true);
    expect(fitsBand(16)).toBe(true);
    expect(fitsBand(24)).toBe(false); // the tripwire: this would reach the copy
  });

  it("the band matches the CSS paddings it is derived from", () => {
    // .ph-top ends at 150 − 24 = 126; .ph-bottom starts at 150 + 24 = 174
    expect(BAND_TOP).toBe(126);
    expect(BAND_BOTTOM).toBe(174);
    expect(BALL_CY - BAND_TOP).toBe(BAND_BOTTOM - BALL_CY); // symmetric about the line
  });

  it("the ball still fits the band at the TOP of its bounce", () => {
    expect(fitsBeat(BALL_R, BEAT_RISE)).toBe(true);
    expect(fitsBeat(BALL_R, 12)).toBe(false); // a taller bounce would clip the countdown
  });

  it("fits EVERY .ph-top padding the CSS actually ships", () => {
    // This is the test that did not exist, and its absence is what let a solid ball erase a
    // glyph. BAND_TOP modelled the 24px padding only, while `.pitch-hero.expired .ph-top`
    // shipped 16px — so fitsBeat certified a band that one hero state did not have.
    for (const pad of PH_TOP_PADDINGS) {
      expect(fitsBeat(BALL_R, BEAT_RISE, bandTopFor(pad))).toBe(true);
    }
    // …and the padding that WAS shipped there fails, which is the whole reason it is gone.
    expect(fitsBeat(BALL_R, BEAT_RISE, bandTopFor(16))).toBe(false);
  });

  it("counts the squash keyframe's vertical stretch, and the clearance is genuinely tight", () => {
    // the apex is translateY(-7) with scale(_, 1.015): top edge = 150 - 7 - 16*1.015 = 126.76
    // against a band top of 126. That is 0.76 units of real clearance — small enough that the
    // 0.75 safety margin leaves this passing by 0.01, and small enough to be worth saying out
    // loud rather than rounding away.
    expect(BEAT_STRETCH).toBe(1.015);
    expect(BALL_CY - BEAT_RISE - BALL_R * BEAT_STRETCH).toBeCloseTo(126.76, 2);
    expect(BALL_CY - BEAT_RISE - BALL_R).toBeGreaterThan(BAND_TOP); // unstretched, comfortable
  });

  it("the ambient roll stays well inside the ring", () => {
    expect(ROLL_X).toBeLessThan(PLAY_R);
    expect(PLAY_R - ROLL_X).toBeGreaterThan(60); // generous margin, not a squeeze
    expect(ringClearance()).toBeGreaterThan(100);
  });

  it("the horizontal corridor really is many ball-widths wide", () => {
    // the finding that unlocked the hero: the constraint is vertical, not horizontal
    expect(2 * PLAY_R).toBeGreaterThan(8 * BALL_R);
  });

  it("rollDegrees couples travel to rotation, and is scale-free", () => {
    // 48 units at r=16 is exactly 3 radians
    expect(rollDegrees(ROLL_X, BALL_R)).toBeCloseTo(3 * (180 / Math.PI), 10);
    expect(rollDegrees(ROLL_X, BALL_R)).toBeCloseTo(171.887, 3);
    // doubling both leaves the rotation unchanged — this is why one keyframe works at
    // every breakpoint
    expect(rollDegrees(2 * ROLL_X, 2 * BALL_R)).toBeCloseTo(rollDegrees(ROLL_X, BALL_R), 10);
    expect(rollDegrees(0)).toBe(0);
    expect(rollDegrees(-ROLL_X)).toBeCloseTo(-rollDegrees(ROLL_X), 10);
  });

  it("beatPhaseMs lands inside one second", () => {
    expect(beatPhaseMs(0)).toBe(0);
    expect(beatPhaseMs(1_234)).toBe(234);
    for (const t of [0, 1, 999, 1000, 1_722_400_123]) {
      expect(beatPhaseMs(t)).toBeGreaterThanOrEqual(0);
      expect(beatPhaseMs(t)).toBeLessThan(1000);
    }
  });
});

describe("the ball looks like a ball", () => {
  it("a pentagon is regular: five vertices, equal edges, equal radii", () => {
    const p = pentagonPoints(0, 0, 10, -90);
    expect(p).toHaveLength(5);
    for (const q of p) expect(Math.hypot(q.x, q.y)).toBeCloseTo(10, 10);
    const edges = p.map((q, i) => {
      const n = p[(i + 1) % 5]!;
      return Math.hypot(n.x - q.x, n.y - q.y);
    });
    for (const e of edges) expect(e).toBeCloseTo(edges[0]!, 10);
  });

  it("a path emits x before y, and closes", () => {
    // SVG takes "x y" pairs. Transposing them yields a pentagon reflected about the diagonal:
    // still five equal sides, still inside the ball, and every geometric assertion above still
    // passes — so the coordinate ORDER needs its own check.
    expect(pentagonPath(100, 200, 10, 0)).toBe(
      "M 110 200 L 103.09 209.511 L 91.91 205.878 L 91.91 194.122 L 103.09 190.489 Z",
    );
    for (const d of ballPatches()) expect(d.endsWith(" Z")).toBe(true);
  });

  it("faceDeg points the first vertex where it says", () => {
    expect(pentagonPoints(0, 0, 10, -90)[0]).toEqual({ x: expect.closeTo(0, 10), y: -10 });
    expect(pentagonPoints(0, 0, 10, 0)[0]).toEqual({ x: 10, y: expect.closeTo(0, 10) });
  });

  it("six patches: one centred, five on the rim at exact fifths", () => {
    expect(ballPatches()).toHaveLength(6);
    const rim = rimPatchCentres();
    expect(rim).toHaveLength(5);
    for (const c of rim) expect(dist(c)).toBeCloseTo(PATCH_RIM_D, 10);
    // 72° apart, aligned with the CENTRE pentagon's vertices (both start at -90)
    for (let k = 0; k < 5; k++) expect(rim[k]!.dirDeg).toBe(-90 + 72 * k);
  });

  it("the rim patches are foreshortened, and reach the silhouette without crossing it", () => {
    // the tilt is what the first attempt missed: unsquashed patches read as a five-pointed
    // star. 0.447 is cos(63.435°), the angle between adjacent pentagon axes.
    expect(PATCH_RIM_SQUASH).toBeCloseTo(0.4472, 4);
    for (const c of rimPatchCentres()) {
      const v = rimPatchPoints(c.dirDeg);
      const reach = v.map(dist);
      expect(Math.max(...reach)).toBeLessThanOrEqual(BALL_R + 1e-9); // never spills
      expect(Math.max(...reach)).toBeGreaterThan(BALL_R * 0.95); // but does touch the rim
      // squashed radially, full width tangentially — a sliver, not a rosette petal
      const radial = Math.max(...reach) - Math.min(...reach);
      expect(radial).toBeLessThan(PATCH_RIM_R * 1.2);
    }
  });

  it("all five rim patches are the same shape, just rotated", () => {
    const side = (p: { x: number; y: number }[]) =>
      p.map((q, i) => {
        const n = p[(i + 1) % 5]!;
        return Math.hypot(n.x - q.x, n.y - q.y);
      });
    const first = side(rimPatchPoints(-90)).sort((a, b) => a - b);
    for (const c of rimPatchCentres()) {
      const got = side(rimPatchPoints(c.dirDeg)).sort((a, b) => a - b);
      got.forEach((v, i) => expect(v).toBeCloseTo(first[i]!, 9));
    }
  });

  it("white shows between the centre patch and the rim ones", () => {
    // if this closes up, the ball reads as a black disc with white cracks
    expect(PATCH_RIM_D - PATCH_RIM_R).toBeGreaterThan(PATCH_C_R + BALL_R * 0.1);
  });

  it("the centre patch is comfortably inside the outline", () => {
    for (const p of pentagonPoints(BALL_CX, BALL_CY, PATCH_C_R, -90)) {
      expect(dist(p)).toBeLessThan(BALL_R * 0.6);
    }
  });

  it("the rim patches point a VERTEX inward, an EDGE at the silhouette", () => {
    // this is how the patches interlock on the solid; authored the other way round the ball
    // shows points at its edge, which no match ball does
    for (const c of rimPatchCentres()) {
      const v = rimPatchPoints(c.dirDeg);
      const nearest = v.reduce((a, b) => (dist(a) < dist(b) ? a : b));
      // the innermost point is a lone vertex ON the axis, not one of a pair straddling it
      const ang = (Math.atan2(nearest.y - BALL_CY, nearest.x - BALL_CX) * 180) / Math.PI;
      const off = Math.abs(((ang - c.dirDeg + 540) % 360) - 180);
      expect(Math.min(off, 360 - off)).toBeLessThan(1e-6);
    }
  });

  it("the five seams lie ON the rim-patch axes and span the gap between the patches", () => {
    // they are hexagon/hexagon edges. Two hexagons sit on adjacent edges of the centre
    // pentagon and meet along a radial edge running from the vertex those edges share out to
    // the rim patch's inward vertex. Placed 36° off (the pentagon's edge midpoints) they lie
    // in the middle of a hexagon, i.e. on no edge of the solid at all.
    const seams = ballSeams();
    expect(seams).toHaveLength(5);
    const axes = rimPatchCentres().map((c) => c.dirDeg);
    for (const s of seams) {
      const a = (Math.atan2(s.y1 - BALL_CY, s.x1 - BALL_CX) * 180) / Math.PI;
      // 0.05° not 1e-6: seam endpoints are rounded to 3 decimals for the SVG, which at a
      // radius of ~5.5 units moves the apparent angle by up to ~0.005°
      const onAxis = axes.some((d) => {
        const gap = Math.abs(((a - d + 540) % 360) - 180);
        return Math.min(gap, 360 - gap) < 0.05;
      });
      expect(onAxis).toBe(true);
      // starts at the centre pentagon's vertex, stops short of the silhouette
      expect(dist({ x: s.x1, y: s.y1 })).toBeCloseTo(PATCH_C_R, 2);
      expect(dist({ x: s.x2, y: s.y2 })).toBeLessThan(BALL_R);
      expect(dist({ x: s.x2, y: s.y2 })).toBeGreaterThan(dist({ x: s.x1, y: s.y1 }));
    }
  });
});

describe("the CSS and the geometry cannot drift apart", () => {
  // Vite returns "" for a .css?raw import under Vitest, so a CSS-reading assertion here
  // would pass VACUOUSLY — worse than no test. The coupling is therefore structural: the
  // hero writes the geometry onto .ph-cell as custom properties and the keyframes read
  // them, so what is checked here is that the hero really does emit all three.
  it("the raw source actually loaded", () => {
    expect(hero.length).toBeGreaterThan(500); // never let the checks below go vacuous
  });

  it("the hero writes travel, rotation and bounce from lib/pitchBall", () => {
    expect(hero).toContain("`${ROLL_X}px`");
    expect(hero).toContain("`${rollDegrees(ROLL_X, BALL_R)}deg`");
    expect(hero).toContain("`${BEAT_RISE}px`");
  });

  it("…under the exact property NAMES the keyframes read", () => {
    // asserting only the values would let a renamed property through, and a keyframe whose
    // var() does not resolve is invalid at computed-value time: the animation silently does
    // NOTHING, which is indistinguishable from the "website looks dead" failure this whole
    // effort exists to fix. The names are the load-bearing half.
    for (const prop of ['"--ph-roll"', '"--ph-roll-deg"', '"--ph-beat"']) {
      expect(hero).toContain(`[${prop} as string]`);
    }
  });

  it("48 units at r=16 is the three radians the roll keyframe turns", () => {
    expect(rollDegrees(ROLL_X, BALL_R)).toBeCloseTo(171.887, 3);
  });
});

describe("the hero is not interactive", () => {
  // The developer removed the kickable ball outright: "just keep it non interactive but
  // rolling and bouncing how it already is". Encoded so it cannot creep back unnoticed.
  it("renders no control and binds no input handler", () => {
    for (const banned of [
      "<button",
      "onPointer",
      "onKeyDown",
      "onClick",
      "tabIndex",
      "cursor: grab",
    ]) {
      expect(hero).not.toContain(banned);
    }
  });

  it("renders none of the removed toy's elements", () => {
    for (const banned of ["ph-ball-hit", "ph-kicked", "ph-hop", "ph-hint", "ph-rally", "ph-redraw"]) {
      expect(hero).not.toContain(banned);
    }
  });
});
