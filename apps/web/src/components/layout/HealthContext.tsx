// One /health fetch at the root, shared everywhere (no polling).
import { createContext, useContext } from "react";
import type { Health } from "../../api";

export type HealthState = { health: Health | null; apiDown: boolean };

export const HealthContext = createContext<HealthState>({ health: null, apiDown: false });

export function useHealth(): HealthState {
  return useContext(HealthContext);
}
