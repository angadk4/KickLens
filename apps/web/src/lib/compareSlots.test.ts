// The compare set's edges, which is where all the behaviour is.
//
// The invariant that matters most is SLOT STABILITY: adding or removing one team must never
// recolour a team you were already reading. With a plain array that fails the first time you
// remove anything, and the failure is silent — two lines just swap colour mid-comparison.
import { describe, expect, it } from "vitest";
import {
  emptySlots,
  idsOf,
  isCompared,
  isDefault,
  pruneSlots,
  slotOf,
  slotsFrom,
  toggleSlot,
} from "./compareSlots";

const MAX = 4;

describe("slots", () => {
  it("start empty and fill in order", () => {
    expect(idsOf(emptySlots(MAX))).toEqual([]);
    expect(idsOf(slotsFrom([7, 8, 9], MAX))).toEqual([7, 8, 9]);
    expect(slotOf(slotsFrom([7, 8, 9], MAX), 8)).toBe(1);
    expect(slotOf(slotsFrom([7, 8, 9], MAX), 99)).toBe(-1);
  });

  it("never hold more than the ceiling, even if handed more", () => {
    expect(idsOf(slotsFrom([1, 2, 3, 4, 5, 6], MAX))).toEqual([1, 2, 3, 4]);
  });
});

describe("toggling", () => {
  it("adds into the first free slot", () => {
    const s = toggleSlot(slotsFrom([7, 8, 9], MAX), 10).slots;
    expect(slotOf(s, 10)).toBe(3);
    expect(idsOf(s)).toEqual([7, 8, 9, 10]);
  });

  it("removes on a second toggle", () => {
    const s = toggleSlot(slotsFrom([7, 8, 9], MAX), 8);
    expect(s.evicted).toBeNull();
    expect(isCompared(s.slots, 8)).toBe(false);
    expect(idsOf(s.slots)).toEqual([7, 9]);
  });

  it("GUARDRAIL: removing one team never moves another", () => {
    // the whole reason this is slots and not a list
    const before = slotsFrom([7, 8, 9], MAX);
    const after = toggleSlot(before, 8).slots;
    expect(slotOf(after, 7)).toBe(slotOf(before, 7)); // 0
    expect(slotOf(after, 9)).toBe(slotOf(before, 9)); // 2 — NOT shifted down to 1
  });

  it("a freed slot is reused by the next pick", () => {
    let s = slotsFrom([7, 8, 9], MAX);
    s = toggleSlot(s, 8).slots; // frees slot 1
    s = toggleSlot(s, 42).slots;
    expect(slotOf(s, 42)).toBe(1);
    expect(slotOf(s, 9)).toBe(2); // still untouched
  });

  it("evicts the OLDEST pick when full, and says who", () => {
    let s = slotsFrom([7, 8, 9], MAX);
    s = toggleSlot(s, 10).slots; // full: 7,8,9,10
    const r = toggleSlot(s, 11);
    expect(r.evicted).toBe(7); // the earliest-picked, not slot 0 by position
    expect(idsOf(r.slots).sort((a, b) => a - b)).toEqual([8, 9, 10, 11]);
    expect(slotOf(r.slots, 11)).toBe(0); // it takes the freed slot
  });

  it("eviction follows PICK order, not slot order", () => {
    // fill, then free slot 0 and refill it — slot 0 is now the NEWEST pick
    let s = slotsFrom([7, 8, 9], MAX);
    s = toggleSlot(s, 10).slots;
    s = toggleSlot(s, 7).slots; // remove the oldest
    s = toggleSlot(s, 20).slots; // 20 lands in slot 0, newest
    const r = toggleSlot(s, 30);
    expect(r.evicted).toBe(8); // now the oldest surviving pick
    expect(isCompared(r.slots, 20)).toBe(true);
  });
});

describe("pruning and defaults", () => {
  it("drops teams the API stopped returning, leaving the rest in place", () => {
    const s = pruneSlots(slotsFrom([7, 8, 9], MAX), new Set([7, 9]));
    expect(idsOf(s)).toEqual([7, 9]);
    expect(slotOf(s, 9)).toBe(2); // did not shuffle up into the hole
  });

  it("recognises the untouched default, so reset is only offered when it means something", () => {
    const d = [7, 8, 9];
    expect(isDefault(slotsFrom(d, MAX), d)).toBe(true);
    expect(isDefault(toggleSlot(slotsFrom(d, MAX), 9).slots, d)).toBe(false);
    expect(isDefault(toggleSlot(slotsFrom(d, MAX), 10).slots, d)).toBe(false);
  });
});
