// THE BALL's geometry (tokens.css pitch-art mark #2), extracted so its constraints are
// executable rather than remembered.
//
// THE MISTAKE THIS FILE USED TO ENCODE: it assumed the ball's constraint was "space around
// the centre spot", and concluded r=10 (a 20px mark inside a 296px ring — 0.46% of its area,
// which is why the hero read as dead). But `.ph-top` is anchored `bottom: 50%` and
// `.ph-bottom` is anchored `top: 50%`, so the copy blocks restrict the ball VERTICALLY and
// not at all HORIZONTALLY. Along the halfway line the ball has a corridor ~2·PLAY_R wide —
// about nine times its own diameter. That is where it lives now.
export const BALL_CX = 150;
export const BALL_CY = 150; // ON the halfway line — the centre spot's exact place
export const BALL_R = 16; // 32px at --ph-size 300; was 10
export const SEAM_RX = 11.5; // 0.72·r — the shipped meridian ratio
export const EQUATOR_RY = 7.2; // 0.45·r — the SECOND arc; spin is illegible without it
export const BALL_STROKE = 1.5; // the house stroke — same as every chalk line

/** The clear band between .ph-top and .ph-bottom. Widened from 134/162 by moving both
    paddings to --space-5 (24px) in layout.css; keep these two in step with that CSS. */
export const BAND_TOP = 126;
export const BAND_BOTTOM = 174;

/** the hero ring */
export const RING_R = 148;

/** How far the ball's CENTRE may travel from the middle before its stroke touches the ring. */
export const PLAY_R = RING_R - BALL_STROKE / 2 - (BALL_R + BALL_STROKE / 2);

/** Ambient roll amplitude along the halfway line, in viewBox units. */
export const ROLL_X = 48;
/** Ambient bounce apex, in viewBox units. */
export const BEAT_RISE = 7;

/** Does a ball of radius r (stroke included) stay inside the text-free band? */
export function fitsBand(r: number, cy: number = BALL_CY): boolean {
  const reach = r + BALL_STROKE / 2;
  return cy - reach >= BAND_TOP && cy + reach <= BAND_BOTTOM;
}

/** …and does it still fit once the bounce lifts it? */
export function fitsBeat(r: number, rise: number): boolean {
  return fitsBand(r, BALL_CY - rise) && fitsBand(r, BALL_CY);
}

/** The rotation a rolling ball of radius r must show after travelling dx.
    Travel and radius are both in viewBox units, so this is SCALE-FREE: one keyframe set is
    physically correct at every --ph-size breakpoint. The CSS keyframe hard-codes the result,
    and a test pins the two together — desync makes the ball skid instead of roll. */
export function rollDegrees(dx: number, r: number = BALL_R): number {
  return (dx / r) * (180 / Math.PI);
}

/** The meridian seam: a half-ellipse from the ball's top to its bottom. */
export function seamPath(): string {
  return `M ${BALL_CX} ${BALL_CY - BALL_R} A ${SEAM_RX} ${BALL_R} 0 0 0 ${BALL_CX} ${BALL_CY + BALL_R}`;
}

/** The equator: the same trick on the other axis. Together with the seam it gives the
    outline two independent features, without which a rotating circle looks static. */
export function equatorPath(): string {
  return `M ${BALL_CX - BALL_R} ${BALL_CY} A ${BALL_R} ${EQUATOR_RY} 0 0 0 ${BALL_CX + BALL_R} ${BALL_CY}`;
}

/** The floodlit crescent: an arc on the upper-left that travels with the ball but NEVER
    rotates. A stationary highlight over a rotating seam is the cheapest way to make rotation
    legible — and the light source is already the identity (pools at 18% / 82% top). */
export function litPath(): string {
  const k = BALL_R * 0.72;
  return `M ${BALL_CX - k} ${BALL_CY - k * 0.62} A ${BALL_R * 0.92} ${BALL_R * 0.92} 0 0 1 ${BALL_CX - k * 0.36} ${BALL_CY - k * 1.08}`;
}

/** Seam endpoints — must lie ON the outline circle, or the ball reads as scribbled. */
export function seamEndpoints(): { x: number; y: number }[] {
  return [
    { x: BALL_CX, y: BALL_CY - BALL_R },
    { x: BALL_CX, y: BALL_CY + BALL_R },
  ];
}

/** Equator endpoints — same rule. */
export function equatorEndpoints(): { x: number; y: number }[] {
  return [
    { x: BALL_CX - BALL_R, y: BALL_CY },
    { x: BALL_CX + BALL_R, y: BALL_CY },
  ];
}

/** Clearance between the ball's outer stroke edge and the ring's inner stroke edge. */
export function ringClearance(r: number = BALL_R): number {
  return RING_R - BALL_STROKE / 2 - (r + BALL_STROKE / 2);
}

/** Offset (ms) that phase-locks the 1s bounce to the wall-clock second, so the ball lands
    WITH the seconds digit. Pure, so it can be tested; negative delay = start mid-cycle. */
export function beatPhaseMs(nowMs: number): number {
  return nowMs % 1000;
}
