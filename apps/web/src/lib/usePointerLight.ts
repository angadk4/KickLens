// Mount ONCE (App.tsx). Gated on a fine pointer AND reduced motion via useMediaQuery,
// which is the repo's only sanctioned live read — and it has to be JS, because the CSS
// killswitch cannot stop a JS-set custom property.
import { useEffect } from "react";
import { acquirePointerLight } from "./pointerLight";
import { useMediaQuery } from "./useMediaQuery";

export function usePointerLight(): void {
  const fine = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const on = fine && !reduced;
  useEffect(() => {
    if (!on) return;
    return acquirePointerLight();
  }, [on]);
}
