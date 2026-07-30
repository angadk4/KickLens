// THE BALL's geometry (hero mark #2), extracted so its constraints are executable rather
// than remembered.
//
// TWO MISTAKES THIS FILE HAS ENCODED, both now corrected:
//
// 1. It assumed the ball's constraint was "space around the centre spot", and concluded r=10
//    (a 20px mark inside a 296px ring — 0.46% of its area, which is why the hero read as
//    dead). But `.ph-top` is anchored `bottom: 50%` and `.ph-bottom` is anchored `top: 50%`,
//    so the copy blocks restrict the ball VERTICALLY and not at all HORIZONTALLY. Along the
//    halfway line the ball has a corridor ~2·PLAY_R wide — about nine times its own diameter.
//
// 2. It drew the ball as chalk: an outline, a meridian seam and an equator. Two thin arcs on
//    a 32px circle read as a diagram of a ball, not a ball. It is now a real black-and-white
//    one — a truncated icosahedron seen face-on at a pentagon, which is the arrangement every
//    match ball has had since 1970. The patch layout is generated here rather than hand-drawn
//    so the five-fold symmetry is exact and the proportions are testable.
export const BALL_CX = 150;
export const BALL_CY = 150; // ON the halfway line — the centre spot's exact place
export const BALL_R = 16; // 32px at --ph-size 300
export const BALL_STROKE = 1.5; // the house stroke — same as every chalk line

/** Every padding-bottom (px) that `.ph-top` ships with, across all hero states. It is a LIST
    because it used to be two: the freeze-pending state carried a tighter 16px exception, and
    nothing checked the ball against it — the constant below modelled only the 24px case, so
    `fitsBeat` certified a band the expired hero did not have and the solid ball erased a
    glyph's descender there once per second. Add a padding here and the test tells you whether
    the ball still fits it. */
export const PH_TOP_PADDINGS = [24];

/** The band's top edge for a given `.ph-top` padding, in viewBox units. `.ph-top` is anchored
    `bottom: 50%` and one viewBox unit is one CSS px at --ph-size 300. */
export function bandTopFor(paddingPx: number): number {
  return BALL_CY - paddingPx;
}

/** The clear band between .ph-top and .ph-bottom, from the paddings above. */
export const BAND_TOP = bandTopFor(Math.min(...PH_TOP_PADDINGS));
export const BAND_BOTTOM = 174;

/** the hero ring */
export const RING_R = 148;

/** How far the ball's CENTRE may travel from the middle before its edge touches the ring. */
export const PLAY_R = RING_R - BALL_STROKE / 2 - (BALL_R + BALL_STROKE / 2);

/** Ambient roll amplitude along the halfway line, in viewBox units. */
export const ROLL_X = 48;
/** Ambient bounce apex, in viewBox units. */
export const BEAT_RISE = 7;

// ── the black patches ───────────────────────────────────────────────────────────────────
// Face-on at a pentagon — the angle every photograph of a match ball is taken from — a
// truncated icosahedron shows exactly six black patches: one dead centre, and five around it
// aligned with the CENTRE pentagon's vertices (not its edges), each turned so a vertex points
// back inward. The other six pentagons are on the far hemisphere. Everything here is derived
// from the solid rather than eyeballed, because the first attempt WAS eyeballed and read as a
// five-pointed star: it drew the outer five at full size, when in reality they are tilted
// away from the viewer and foreshorten to slivers against the silhouette.
//
// Truncated icosahedron of edge a: circumradius 2.478a; a pentagon face's own circumradius is
// a/(2·sin36°) = 0.851a, and its centre sits 2.327a from the solid's centre. Adjacent
// pentagon axes are 63.435° apart (they are the icosahedron's vertex directions). Project
// along the centre pentagon's axis and the three numbers below fall out.
const CIRCUM = 2.478; // ×a — the silhouette
const PENT_R = 0.851; // ×a — a pentagon face's circumradius
const FACE_D = 2.327; // ×a — solid centre → pentagon face centre
const TILT_DEG = 63.4349; // between adjacent pentagon axes

const rad = (deg: number) => (deg * Math.PI) / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Centre pentagon: seen square-on, so its true circumradius. 0.343·r. */
export const PATCH_C_R = BALL_R * (PENT_R / CIRCUM);
/** How far the rim patches' centres project from the middle. 0.840·r. */
export const PATCH_RIM_D = BALL_R * ((FACE_D / CIRCUM) * Math.sin(rad(TILT_DEG)));
/** Their tangential half-width — unforeshortened, because the tilt is radial. */
export const PATCH_RIM_R = BALL_R * (PENT_R / CIRCUM);
/** …and the radial squash that tilt costs them. 0.447 — this is the number whose absence
    made the first ball look like a star rather than a sphere. */
export const PATCH_RIM_SQUASH = Math.cos(rad(TILT_DEG));

/** A regular pentagon's five vertices, the first pointing in `faceDeg` (SVG degrees: -90 is
    up). Generated, so the symmetry is exact at every radius. */
export function pentagonPoints(
  cx: number,
  cy: number,
  r: number,
  faceDeg: number,
): { x: number; y: number }[] {
  return Array.from({ length: 5 }, (_, k) => {
    const a = rad(faceDeg + 72 * k);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

export function pentagonPath(cx: number, cy: number, r: number, faceDeg: number): string {
  const p = pentagonPoints(cx, cy, r, faceDeg);
  return `M ${p.map((q) => `${r3(q.x)} ${r3(q.y)}`).join(" L ")} Z`;
}

/** A rim patch's five projected vertices: a regular pentagon built in the tangent plane with
    a vertex pointing inward, squashed along the radius by the tilt, then carried out to its
    centre. Doing the squash in local coordinates (before the rotation into place) is what
    keeps all five identical under rotation instead of five subtly different shapes. */
export function rimPatchPoints(dirDeg: number): { x: number; y: number }[] {
  const a = rad(dirDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // local: +u outward along the radius, +v tangential, and local "up" (-y) maps to OUTWARD.
  // So the vertex must be authored at +90 (local down) to point inward at the centre pentagon,
  // which is how the patches actually interlock: the radial edge where two hexagons meet runs
  // from a centre-pentagon vertex out to a rim patch's vertex. Authoring it at -90 gave the
  // patch a point at the silhouette instead of the flat edge a real ball shows there.
  return pentagonPoints(0, 0, PATCH_RIM_R, 90).map((p) => {
    const u = PATCH_RIM_D + -p.y * PATCH_RIM_SQUASH;
    const v = p.x;
    return { x: BALL_CX + u * cos - v * sin, y: BALL_CY + u * sin + v * cos };
  });
}

/** The six black patches: the centre pentagon, then the five foreshortened rim ones. */
export function ballPatches(): string[] {
  const toPath = (p: { x: number; y: number }[]) =>
    `M ${p.map((q) => `${r3(q.x)} ${r3(q.y)}`).join(" L ")} Z`;
  return [
    pentagonPath(BALL_CX, BALL_CY, PATCH_C_R, -90),
    ...rimPatchCentres().map((c) => toPath(rimPatchPoints(c.dirDeg))),
  ];
}

/** Where the five rim patches sit — aligned with the centre pentagon's vertices. */
export function rimPatchCentres(): { x: number; y: number; dirDeg: number }[] {
  return Array.from({ length: 5 }, (_, k) => {
    const dirDeg = -90 + 72 * k;
    const a = rad(dirDeg);
    return {
      x: BALL_CX + PATCH_RIM_D * Math.cos(a),
      y: BALL_CY + PATCH_RIM_D * Math.sin(a),
      dirDeg,
    };
  });
}

/** The five hexagon/hexagon seams — the only seams visible on the white half.
    They lie on the RIM-PATCH axes, not 36° off them. Two hexagons sit on adjacent edges of the
    centre pentagon and meet along one radial edge; that edge starts at the vertex those two
    pentagon edges share and ends at the inward-pointing vertex of the rim patch on the same
    axis. An earlier version put them at the pentagon's edge midpoints, which is the middle of
    a hexagon — five lines lying on no edge of the solid, while the five real ones were absent.
    (Nothing about the render objected; the doc comment claiming they were hexagon seams is
    what made it a defect rather than a liberty.) */
export function ballSeams(): { x1: number; y1: number; x2: number; y2: number }[] {
  const inner = PATCH_C_R; // a vertex of the centre pentagon
  const outer = PATCH_RIM_D - PATCH_RIM_R * PATCH_RIM_SQUASH; // the rim patch's inward vertex
  return rimPatchCentres().map((c) => {
    const a = rad(c.dirDeg);
    return {
      x1: r3(BALL_CX + inner * Math.cos(a)),
      y1: r3(BALL_CY + inner * Math.sin(a)),
      x2: r3(BALL_CX + outer * Math.cos(a)),
      y2: r3(BALL_CY + outer * Math.sin(a)),
    };
  });
}

// ── the constraints ─────────────────────────────────────────────────────────────────────

/** Does a ball of radius r (stroke included) stay inside the text-free band? */
export function fitsBand(r: number, cy: number = BALL_CY, bandTop: number = BAND_TOP): boolean {
  const reach = r + BALL_STROKE / 2;
  return cy - reach >= bandTop && cy + reach <= BAND_BOTTOM;
}

/** …and does it still fit once the bounce lifts it? The squash keyframe stretches the ball
    1.5% taller at the apex, which is small but was exactly the margin that vanished: it is
    counted here rather than ignored. */
export const BEAT_STRETCH = 1.015;

export function fitsBeat(r: number, rise: number, bandTop: number = BAND_TOP): boolean {
  const stretched = r * BEAT_STRETCH;
  return (
    fitsBand(stretched, BALL_CY - rise, bandTop) && fitsBand(stretched, BALL_CY, bandTop)
  );
}

/** The rotation a rolling ball of radius r must show after travelling dx.
    Travel and radius are both in viewBox units, so this is SCALE-FREE: one keyframe set is
    physically correct at every --ph-size breakpoint. The CSS keyframe hard-codes the result,
    and a test reads the CSS and pins the two together — desync makes the ball skid. */
export function rollDegrees(dx: number, r: number = BALL_R): number {
  return (dx / r) * (180 / Math.PI);
}

/** Clearance between the ball's outer edge and the ring's inner stroke edge. */
export function ringClearance(r: number = BALL_R): number {
  return RING_R - BALL_STROKE / 2 - (r + BALL_STROKE / 2);
}

/** Offset (ms) that phase-locks the 1s bounce to the wall-clock second, so the ball lands
    WITH the seconds digit. Pure, so it can be tested; negative delay = start mid-cycle. */
export function beatPhaseMs(nowMs: number): number {
  return nowMs % 1000;
}
