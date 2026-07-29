// The juggling loader's policy + geometry (tokens.css pitch-art: the ball, placement #2).
// One ball per screen, and only where the skeleton IS the page's content — a hard height
// floor keeps it out of card-sized placeholders (four juggling balls in a grid is a circus).
export const JUGGLE_MIN_HEIGHT = 140;

export function canJuggle(height: number): boolean {
  return height >= JUGGLE_MIN_HEIGHT;
}

/** loader-ball geometry, in its own 48×64 box: rest near the floor, apex on the bob */
export const KJ_CX = 24;
export const KJ_CY = 48; // resting center
export const KJ_R = 10;
export const KJ_SEAM_RX = 7.2;

export function kjSeamPath(): string {
  return `M ${KJ_CX} ${KJ_CY - KJ_R} A ${KJ_SEAM_RX} ${KJ_R} 0 0 0 ${KJ_CX} ${KJ_CY + KJ_R}`;
}
