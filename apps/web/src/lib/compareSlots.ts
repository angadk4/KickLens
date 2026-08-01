// The /ratings compare set: which teams are plotted boldly, and in which colour slot.
//
// Modelled as FIXED SLOTS rather than a list, and that is the whole point. With a plain
// array, removing a team shifts every later one down a slot, so the two lines you were
// already reading silently change colour — the single most disorienting thing a comparison
// control can do. A slot holds its colour until its own team leaves it.
//
// Pure and unit-tested because the interesting behaviour is all in the edges: a freed slot is
// reused by the next pick, and picking beyond the ceiling evicts the OLDEST rather than
// rejecting the click (a toggle that silently does nothing is worse than one that visibly
// makes room, and disabling 26 buttons is both ugly and a screen-reader mess — so the
// eviction is announced instead, see RatingsPage's aria-live region).

export type Slot = { id: number; seq: number } | null;

/** `seq` is a monotonic pick counter, so "oldest" is by PICK order, not slot order. */
export function emptySlots(max: number): Slot[] {
  return Array.from({ length: max }, () => null);
}

export function slotsFrom(ids: number[], max: number): Slot[] {
  const s = emptySlots(max);
  ids.slice(0, max).forEach((id, i) => {
    s[i] = { id, seq: i };
  });
  return s;
}

export function idsOf(slots: Slot[]): number[] {
  return slots.filter((s): s is NonNullable<Slot> => s !== null).map((s) => s.id);
}

export function slotOf(slots: Slot[], id: number): number {
  return slots.findIndex((s) => s?.id === id);
}

export function isCompared(slots: Slot[], id: number): boolean {
  return slotOf(slots, id) >= 0;
}

/** Toggle a team. Returns the new slots plus whichever team was pushed out, so the caller can
    say so out loud — an unannounced eviction is a surprise, and this is a keyboard control. */
export function toggleSlot(
  slots: Slot[],
  id: number,
): { slots: Slot[]; evicted: number | null } {
  const next = [...slots];
  const here = slotOf(next, id);
  if (here >= 0) {
    next[here] = null; // second click removes; the slot waits for the next pick
    return { slots: next, evicted: null };
  }
  const seq = Math.max(0, ...next.map((s) => s?.seq ?? -1)) + 1;
  const free = next.findIndex((s) => s === null);
  if (free >= 0) {
    next[free] = { id, seq };
    return { slots: next, evicted: null };
  }
  // full: the earliest-picked slot yields
  let oldest = 0;
  for (let i = 1; i < next.length; i++) {
    if ((next[i]?.seq ?? Infinity) < (next[oldest]?.seq ?? Infinity)) oldest = i;
  }
  const evicted = next[oldest]!.id;
  next[oldest] = { id, seq };
  return { slots: next, evicted };
}

/** Drop teams the API no longer returns, keeping everyone else in place — a refetch must not
    shuffle the reader's comparison. */
export function pruneSlots(slots: Slot[], live: Set<number>): Slot[] {
  return slots.map((s) => (s && live.has(s.id) ? s : null));
}

/** Is this the untouched default (the first `n` teams in their original slots)? Drives whether
    the reset control is offered at all. */
export function isDefault(slots: Slot[], defaults: number[]): boolean {
  const ids = idsOf(slots);
  return ids.length === defaults.length && ids.every((id, i) => id === defaults[i]);
}
