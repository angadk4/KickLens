// Split-flap scoreboard digits: the policy, pure and unit-testable.
//
// The difference between a SCOREBOARD and a SLOT MACHINE is entirely in the duration. A
// slot machine spins many cells fast; a scoreboard moves the MINIMUM distance at a
// constant mechanical rate. So duration is proportional to the number of cells travelled:
// 4→5 is one cell and crisp; 9→0 runs nine cells and is visibly a run of the reels, which
// happens once every ten seconds on the tens-of-seconds column and is the beat that makes
// the countdown feel like machinery instead of a clock.
export const FLAP_MS_BASE = 150;
export const FLAP_MS_PER_CELL = 30;
export const FLAP_MS_MAX = 420;

export type FlapColumn = {
  /** the digit to show, 0-9 */
  digit: number;
  /** how many cells this column travels (0 = no motion) */
  cells: number;
  durMs: number;
};

export function flapDuration(cells: number): number {
  if (cells <= 0) return 0;
  return Math.min(FLAP_MS_MAX, FLAP_MS_BASE + cells * FLAP_MS_PER_CELL);
}

/** Pad a non-negative integer to a fixed column count. Values wider than `pad` keep all
    their digits (a count must never be silently truncated). */
export function flapDigits(value: number, pad: number): string {
  const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return String(n).padStart(pad, "0");
}

/** Per-column plan. `prev === null` is FIRST PAINT and must never animate — otherwise every
    digit on the page runs its reels on load, which is the slot machine. A column whose digit
    is unchanged also gets 0: only what actually moved moves.

    A WIDTH CHANGE (9 → 10) is also still: the columns change meaning, so position 0 goes
    from being the units digit to being the tens digit and comparing them positionally is
    meaningless — "9 → 1" is not a digit travelling 8 cells, it is a different column. */
export function flapPlan(prev: string | null, next: string): FlapColumn[] {
  const comparable = prev !== null && prev.length === next.length;
  return next.split("").map((ch, i) => {
    const digit = Number(ch);
    const from = comparable ? prev[i] : undefined;
    const cells = from === undefined || from === ch ? 0 : Math.abs(digit - Number(from));
    return { digit, cells, durMs: flapDuration(cells) };
  });
}
