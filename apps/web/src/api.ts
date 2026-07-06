// Typed client for the read-only KickLens API (T-180).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type Forecast = {
  type: "official-frozen" | "draft-preliminary";
  p_home: number;
  p_draw: number;
  p_away: number;
  forecast_hash?: string;
};

export type UpcomingMatch = {
  match_id: number;
  kickoff_utc: string;
  home: string;
  away: string;
  season: number;
  forecast?: Forecast;
};

export type CompletedItem = {
  match_id: number;
  home: string;
  away: string;
  kickoff_utc: string;
  result: "H" | "D" | "A";
  p_home: number;
  p_draw: number;
  p_away: number;
  forecast_hash: string;
  log_loss: number;
  correct: boolean;
};

export type Health = {
  status: string;
  last_ingest: string | null;
  last_grade: string | null;
  freshness_ok: boolean;
};

export type Scope = "dev" | "test" | "backtest" | "live";

export type Performance = {
  scope: Scope;
  as_of_utc: string;
  metrics: Record<string, unknown>;
};

export type Methodology = {
  model: string;
  cutoff: string;
  tamper_evidence: string;
  evidence_separation: string;
  honesty_notes: string[];
  data: string;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => get<Health>("/health"),
  upcoming: () => get<UpcomingMatch[]>("/matches/upcoming"),
  completed: () =>
    get<{ total_graded: number; items: CompletedItem[] }>("/predictions/completed"),
  performance: (scope: Scope) => get<Performance>(`/performance?scope=${scope}`),
  methodology: () => get<Methodology>("/methodology"),
};
