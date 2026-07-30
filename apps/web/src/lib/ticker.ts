// The crawl's speed, as a policy instead of a magic number.
//
// It used to be `--ticker-dur = max(40, items.length * 12)s` over a track that translates
// −50%. With 7 items of ~370px that is a 2590px set in 84s = ~31 px/s. Broadcast crawls run
// 60-120 px/s; below ~60 a crawl reads as stalled rather than calm. The old formula also
// ignored item LENGTH, so six short items and six long ones crawled at different speeds.
export const TICKER_PX_PER_S = 72;
export const TICKER_MIN_S = 12;
export const TICKER_MAX_S = 90;
/** used only when the width isn't measurable yet (SSR, zero-width first paint) */
export const TICKER_FALLBACK_S = 40;

/** Seconds for one full pass of a set `setWidthPx` wide at `rate` px/s. */
export function tickerDuration(
  setWidthPx: number,
  rate: number = TICKER_PX_PER_S,
): number {
  if (!Number.isFinite(setWidthPx) || setWidthPx <= 0 || rate <= 0) return TICKER_FALLBACK_S;
  return Math.min(TICKER_MAX_S, Math.max(TICKER_MIN_S, setWidthPx / rate));
}
