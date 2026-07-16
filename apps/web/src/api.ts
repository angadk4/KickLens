// Typed client for the read-only KickLens API (T-180 + dashboard-v2 additions).
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
  rps?: number;
  brier?: number;
};

export type Health = {
  status: string;
  last_ingest: string | null;
  last_grade: string | null;
  freshness_ok: boolean;
};

export type Scope = "dev" | "test" | "backtest" | "live";

export type ConfidenceBucket = { n: number; log_loss: number; accuracy: number };

/** Known snapshot payload keys, tolerant of extras — panels render only what exists. */
export type MetricsPayload = {
  n?: number;
  log_loss?: number;
  rps?: number;
  brier?: number;
  ece?: number;
  accuracy?: number;
  log_loss_ci95?: [number, number];
  b3_log_loss?: number;
  incumbent_b3_log_loss?: number;
  market_log_loss?: number;
  by_confidence?: Record<string, ConfidenceBucket>;
  by_month?: Record<string, { n: number; log_loss: number }>;
  note?: string;
} & Record<string, unknown>;

export type Performance = {
  scope: Scope;
  as_of_utc: string;
  metrics: MetricsPayload;
};

export type Grade = { log_loss: number; rps: number; brier: number; correct: boolean };

export type PredictionEvent = {
  type: string;
  at: string | null;
  details: Record<string, unknown> | null;
};

export type ForecastVersion = {
  prediction_id: number;
  p_home: number;
  p_draw: number;
  p_away: number;
  cutoff_utc: string | null;
  created_utc: string | null;
  forecast_hash: string;
  fixture_revision: number;
  grade: Grade | null;
  anchored_at_utc: string | null;
  stale_inputs: boolean;
  model_version_id: number;
  model_label: string;
  voided: boolean;
};

export type MatchDetail = {
  match_id: number;
  kickoff_utc: string | null;
  status: string;
  result: "H" | "D" | "A" | null;
  score: string | null;
  home: string;
  away: string;
  season: number;
  neutral_site: boolean;
  draft: {
    p_home: number;
    p_draw: number;
    p_away: number;
    generated_utc: string | null;
  } | null;
  events: PredictionEvent[];
  forecasts: ForecastVersion[];
};

export type VerifiedForecast = {
  prediction_id: number;
  voided: boolean;
  forecast_hash: string;
  recomputed_hash: string;
  hash_match: boolean;
  canonical_json: string | null;
  fields: Record<string, string | number | null>;
  model_label: string;
  stale_inputs: boolean;
  code_git_sha: string;
  seed: number;
  lockfile_hash: string;
  anchored_at_utc: string | null;
  anchor_day: string | null;
  expected_anchor_line: string | null;
  anchor_file: { raw_url: string; html_url: string } | null;
  merkle: { day: string; root: string; committed_at_utc: string | null } | null;
  events: PredictionEvent[];
};

export type Verification = {
  match_id: number;
  kickoff_utc: string | null;
  home: string;
  away: string;
  season: number;
  anchor_repo: string | null;
  hash_algorithm: string;
  merkle_algorithm: string;
  forecasts: VerifiedForecast[];
};

export type TeamRating = {
  rank: number;
  team_id: number;
  team: string;
  rating: number;
  form: string;
  played_season: number;
  delta_5: number | null;
  provisional: boolean;
  last_match_utc: string | null;
  history?: { date: string; rating: number }[];
};

export type TeamRatings = {
  as_of_utc: string | null;
  generated_at_utc: string;
  season: number | null;
  n_rated_matches: number;
  method: string;
  teams: TeamRating[];
};

export type MerkleRootItem = {
  day: string;
  root: string;
  committed_at_utc: string | null;
  anchor_file_raw_url: string | null;
  anchor_file_html_url: string | null;
};

export type CalibrationScope = {
  n?: number;
  ece?: number;
  by_confidence?: Record<string, ConfidenceBucket>;
  classwise_ece_H?: number;
  classwise_ece_D?: number;
  classwise_ece_A?: number;
};

export type CalibrationResponse = Partial<Record<"dev" | "test" | "live", CalibrationScope>>;

export type ModelVersion = {
  model_version_id: number;
  label: string;
  is_production: boolean;
  created_utc: string | null;
  promoted_utc: string | null;
  league: string;
};

export type BaselineRung = {
  rung: string;
  name: string;
  log_loss: number;
  ci95: [number, number] | null;
};

export type Methodology = {
  model: string;
  cutoff: string;
  tamper_evidence: string;
  evidence_separation: string;
  honesty_notes: string[];
  data: string;
  // enrichment keys are OPTIONAL so the page degrades gracefully against an older API
  calibration?: { method: string | null; param_t: number | null; note: string };
  dataset?: {
    snapshot_hash: string | null;
    row_count: number | null;
    date_range_start: string | null;
    date_range_end: string | null;
    created_utc: string | null;
  };
  baselines?: { scope: string; n: number; note: string; ladder: BaselineRung[] };
  anchor_repo_html_url?: string | null;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => get<Health>("/health"),
  upcoming: () => get<UpcomingMatch[]>("/matches/upcoming"),
  completed: (limit = 50, offset = 0) =>
    get<{ total_graded: number; items: CompletedItem[] }>(
      `/predictions/completed?limit=${limit}&offset=${offset}`,
    ),
  performance: (scope: Scope) => get<Performance>(`/performance?scope=${scope}`),
  methodology: () => get<Methodology>("/methodology"),
  matchDetail: (id: number) => get<MatchDetail>(`/matches/${id}`),
  verification: (id: number) => get<Verification>(`/matches/${id}/verification`),
  ratings: (history = 0) =>
    get<TeamRatings>(`/teams/ratings${history > 0 ? `?history=${history}` : ""}`),
  merkleRoots: (limit = 30) =>
    get<{ repo: string | null; algorithm: string; items: MerkleRootItem[] }>(
      `/merkle-roots?limit=${limit}`,
    ),
  calibration: () => get<CalibrationResponse>("/calibration"),
  modelVersions: () => get<ModelVersion[]>("/model-versions"),
};
