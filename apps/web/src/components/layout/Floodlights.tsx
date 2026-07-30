// The floodlight banks. A LEAF component on purpose: it subscribes to the shared upcoming
// data to know whether anything is in play, and putting that subscription in App would
// re-render every page (including a 50-card record grid) on each matchday poll — the same
// call the repo already made when it extracted HealthBanners.
//
// The pools breathe rather than drift (see styles/base.css for the arithmetic that killed
// the drift), and --fl-gain is decided by lib/floodGain.ts, where the honesty invariant
// lives: a page with no live data never brightens for a live slate.
import { floodGain, breathSeconds } from "../../lib/floodGain";
import { useUpcoming } from "./UpcomingContext";

export function Floodlights({ page }: { page: string }) {
  const { inPlay } = useUpcoming();
  const matchday = !!inPlay && inPlay.length > 0;
  return (
    <div
      className="floodlights"
      aria-hidden
      style={{
        ["--fl-gain" as string]: floodGain(page, matchday),
        ["--dur-breath" as string]: `${breathSeconds(matchday)}s`,
      }}
    >
      <div className="fl-haze" />
    </div>
  );
}
