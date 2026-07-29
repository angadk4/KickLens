// THE BALL's geometry (tokens.css pitch-art mark #2), extracted so its one hard
// constraint is executable: the hero's countdown text ends at y=134 and the fixture text
// starts at y=162 (at the 1:1 300px mapping — smaller sizes only widen the band), so the
// ball must live inside that 28-unit chalk band or it collides with the copy the hero
// exists to show. diagramNodes.ts precedent: geometry is data, and data gets tests.
export const BALL_CX = 150;
export const BALL_CY = 150; // ON the halfway line — the center spot's exact place
export const BALL_R = 10;
export const SEAM_RX = 7.2; // one meridian seam: what makes the roll legible
export const BALL_STROKE = 1.5; // the house stroke — same as every chalk line

/** the clear band between .ph-top (ends y=134) and .ph-bottom (starts y=162) */
export const BAND_TOP = 134;
export const BAND_BOTTOM = 162;

/** the hero ring: the ball must sit well inside it, never touching */
export const RING_R = 148;

/** Does a ball of radius r (stroke included) stay inside the text-free band? */
export function fitsBand(r: number, cy: number = BALL_CY): boolean {
  const reach = r + BALL_STROKE / 2;
  return cy - reach >= BAND_TOP && cy + reach <= BAND_BOTTOM;
}

/** The meridian seam: a half-ellipse from the ball's top to its bottom. */
export function seamPath(): string {
  return `M ${BALL_CX} ${BALL_CY - BALL_R} A ${SEAM_RX} ${BALL_R} 0 0 0 ${BALL_CX} ${BALL_CY + BALL_R}`;
}

/** Seam endpoints — must lie ON the outline circle, or the ball reads as scribbled. */
export function seamEndpoints(): { x: number; y: number }[] {
  return [
    { x: BALL_CX, y: BALL_CY - BALL_R },
    { x: BALL_CX, y: BALL_CY + BALL_R },
  ];
}

/** Clearance between the ball's outer stroke edge and the ring's inner stroke edge. */
export function ringClearance(r: number = BALL_R): number {
  return RING_R - BALL_STROKE / 2 - (r + BALL_STROKE / 2);
}
