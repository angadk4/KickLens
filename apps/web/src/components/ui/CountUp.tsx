// One-shot count-up for stat values; renders the final value immediately under reduced motion.
import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

export function CountUp({
  value,
  format,
}: {
  value: number;
  format: (v: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatRef = useRef(format);
  formatRef.current = format; // latest formatter without re-triggering the animation
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = formatRef.current(v);
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  return <span ref={ref}>{format(value)}</span>;
}
