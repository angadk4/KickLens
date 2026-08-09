// The live record, month by month — pure reshaping for components/charts/MonthlyRecord.
// The API's by_month map is Record<"YYYY-MM", {n, log_loss}> and is only computed for the
// LIVE scope; everything defensive here (malformed keys, float n) exists because this is
// a payload boundary, not because the backend is untrusted by design.
import { KNEW_NOTHING_LL, MIN_N_BUCKET_DETAIL } from "./facts";

export type MonthlyRow = {
  key: string; // "2026-07"
  label: string; // "Jul 2026"
  n: number;
  logLoss: number;
  /** below the site-wide bucket-detail floor — drawn hollow: an anecdote, not evidence */
  small: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const KEY = /^(\d{4})-(\d{2})$/;

/** Ascending calendar order; malformed keys and non-finite values are dropped, never
    thrown — a damaged month must not take down the whole performance page. */
export function monthlyRows(
  byMonth: Record<string, { n: number; log_loss: number }> | null | undefined,
  minDetail: number,
): MonthlyRow[] {
  if (!byMonth) return [];
  const rows: MonthlyRow[] = [];
  for (const [key, v] of Object.entries(byMonth)) {
    const m = KEY.exec(key);
    if (!m) continue;
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx < 0 || monthIdx > 11) continue;
    const n = Math.round(Number(v?.n));
    const logLoss = Number(v?.log_loss);
    if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(logLoss)) continue;
    rows.push({
      key,
      label: `${MONTHS[monthIdx]} ${m[1]}`,
      n,
      logLoss,
      small: n < minDetail,
    });
  }
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return rows;
}

/** One month is a datum, not a trend — the chart earns its place at two. */
export function showMonthly(rows: MonthlyRow[]): boolean {
  return rows.length >= 2;
}

/** The figcaption. The hollow-dot explanation appears ONLY when a hollow dot does. */
export function monthlyCaption(rows: MonthlyRow[]): string {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const base = `Live log loss by calendar month (n=${total.toLocaleString()}), where lower is better; the rule marks the knew-nothing baseline (${KNEW_NOTHING_LL.toFixed(4)}).`;
  return rows.some((r) => r.small)
    ? `${base} Hollow dots are months below n=${MIN_N_BUCKET_DETAIL}: anecdotes, not evidence.`
    : base;
}
