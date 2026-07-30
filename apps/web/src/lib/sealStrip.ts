// The daily-seal strip's data shape, kept pure so the honest caption can be tested.
//
// The merkle-roots endpoint serves up to 180 days; the app only ever asked for 1 (the footer's
// lone "latest seal" chip). 90 days of daily tamper-evidence was one argument away.
//
// THE READING THAT MUST BE FORECLOSED: one cell is one CALENDAR DAY, not one forecast. A day
// with no official forecast has no root and must not look like a failure.
export type SealDay = {
  /** YYYY-MM-DD, UTC */
  day: string;
  root: string | null;
  committedAt: string | null;
  url: string | null;
  /** No root YET, and none is due yet. The Merkle root for a day is committed at 12:00 UTC the
      FOLLOWING day, so today never has one and yesterday has none until that run. Without this
      the two newest cells always render as if a seal had been missed — the strip would open by
      accusing the system of failing twice. */
  pending: boolean;
};

/** UTC day keys, oldest → newest, ending today. */
export function dayKeys(todayMs: number, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(todayMs - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/** Join the calendar window against whatever roots exist. Missing days are explicit nulls,
    never gaps — a strip you can count. */
export function buildStrip(
  roots: { day: string; root: string; committed_at_utc?: string | null; anchor_file_raw_url?: string | null }[],
  todayMs: number,
  days = 90,
): SealDay[] {
  const byDay = new Map(roots.map((r) => [r.day.slice(0, 10), r]));
  const keys = dayKeys(todayMs, days);
  const today = keys[keys.length - 1];
  const yesterday = keys[keys.length - 2];
  // yesterday's root lands at 12:00 UTC today; before that it is not late, it is not due
  const beforeNoon = new Date(todayMs).getUTCHours() < 12;
  return keys.map((day) => {
    const r = byDay.get(day);
    const root = r?.root ?? null;
    return {
      day,
      root,
      committedAt: r?.committed_at_utc ?? null,
      url: r?.anchor_file_raw_url ?? null,
      pending: root === null && (day === today || (day === yesterday && beforeNoon)),
    };
  });
}

export function sealedCount(strip: SealDay[]): number {
  return strip.filter((d) => d.root !== null).length;
}

export function pendingCount(strip: SealDay[]): number {
  return strip.filter((d) => d.pending).length;
}

/** The caption. It must say what a cell IS, or a run of empty cells reads as broken — and it
    must exclude the not-yet-due days from the denominator, or the strip reports its own newest
    days as failures. */
export function stripCaption(strip: SealDay[]): string {
  const pending = pendingCount(strip);
  const eligible = strip.length - pending;
  return (
    `One cell per calendar day. A filled cell means that day's official forecasts were sealed ` +
    `into a Merkle root and pushed to the public repository; an empty cell means no official ` +
    `forecast was issued that day. ${sealedCount(strip)} of the last ${eligible} settled days ` +
    `sealed` +
    (pending > 0
      ? `; the newest ${pending === 1 ? "day is" : `${pending} days are`} still awaiting the ` +
        `12:00 UTC seal.`
      : ".")
  );
}
