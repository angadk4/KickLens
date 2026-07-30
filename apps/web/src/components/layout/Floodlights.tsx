// The floodlight banks. A LEAF component on purpose: it subscribes to the shared upcoming
// data to know whether anything is in play, and putting that subscription in App would
// re-render every page (including a 50-card record grid) on each matchday poll — the same
// call the repo already made when it extracted HealthBanners.
//
// The pools breathe rather than drift (see styles/base.css for the arithmetic that killed
// the drift), and --fl-gain is decided by lib/floodGain.ts, where the honesty invariant
// lives: a page with no live data never brightens for a live slate.
import { useEffect, useRef, useState } from "react";
import { subscribeFlare } from "../../lib/flare";
import { floodGain, breathSeconds } from "../../lib/floodGain";
import { useUpcoming } from "./UpcomingContext";

export function Floodlights({ page }: { page: string }) {
  const { inPlay } = useUpcoming();
  const matchday = !!inPlay && inPlay.length > 0;
  // the flare: the pitch flinches when the ball is smashed into the chalk (lib/flare.ts)
  const [flared, setFlared] = useState(0);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const off = subscribeFlare(() => {
      setFlared((n) => n + 1);
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => setFlared(0), 900);
    });
    return () => {
      off();
      if (t.current) clearTimeout(t.current);
    };
  }, []);
  // the flare is a brief multiplier on the gain the keyframes already read — no new layer,
  // no competing animation, nothing paint-only
  const gain = floodGain(page, matchday) * (flared ? 1.12 : 1);
  return (
    <div
      className="floodlights"
      aria-hidden
      style={{
        ["--fl-gain" as string]: gain,
        ["--dur-breath" as string]: `${breathSeconds(matchday)}s`,
      }}
    >
      <div className="fl-haze" />
    </div>
  );
}
