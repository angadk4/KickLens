// System health, shared everywhere. It is refreshed by the SAME poll that drives the board
// (UpcomingContext), through a module store — see healthStore.ts for why that is a store and
// not a provider. The hook name and shape are unchanged, so no call site had to move.
import type { Health } from "../../api";
import { useHealthStore } from "./healthStore";

export type HealthState = { health: Health | null; apiDown: boolean };

export function useHealth(): HealthState {
  return useHealthStore();
}
