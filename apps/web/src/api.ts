// Typed client for the read-only KickLens API (T-180 + dashboard-v2 additions).
import { cachedGet, prefetch } from "./lib/requestCache";

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

/** A frozen official forecast whose match has kicked off but isn't graded yet — the window
    between "upcoming" and the graded record. forecast is always present and official-frozen. */
export type InPlayItem = {
  match_id: number;
  kickoff_utc: string;
  home: string;
  away: string;
  season: number;
  status: string;
  forecast: Forecast;
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
  // OPTIONAL so the app degrades gracefully against an older API. A narrow results-only
  // night sweep keeps last_ingest moving while the FULL fixture sweep (fixtures, kickoff
  // moves, supersession) is dead — these two say so instead of letting the schedule go
  // quietly stale behind a green light.
  /** completion of the last FULL fixture sweep */
  last_full_ingest?: string | null;
  /** is that full sweep inside the 36h freshness limit */
  schedule_fresh?: boolean;
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
  /** B3's 95% CI, injected per scope by the API from published evidence (dev: baselines.md,
      test: the sealed report). Optional so an older API degrades to a dash, as before. */
  b3_log_loss_ci95?: [number, number];
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
  /** why the forecast was voided (postponed / cancelled / abandoned / kickoff moved), or null */
  void_reason?: string | null;
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

/** /activity — the mission-control feed: ledger events (canonical team names, joined
    server-side) merged with ingest job runs, newest first. */
export type ActivityItem =
  | {
      kind: "ledger";
      type: string;
      at_utc: string | null;
      match_id: number;
      home: string;
      away: string;
      details: Record<string, unknown> | null;
    }
  | { kind: "job"; job: string; sweep: string; status: string; at_utc: string | null };

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

// Every read goes through lib/requestCache: in-flight dedup (one cold start instead of eight)
// plus a timeout. Staleness is unchanged — the cache's TTL is read from the server's own
// Cache-Control, the same header the browser cache already obeys.
function get<T>(path: string): Promise<T> {
  return cachedGet<T>(`${BASE}${path}`, path);
}

// ONE definition of every path. `api.*` fetches it and `warm.*` prefetches it from the same
// builder, so a warmed URL can never drift from the URL actually requested — a divergence would
// silently prefetch something nobody asks for and leave the real call paying full cold price.
/** The app shell's four reads in one response — see the /board docstring in apps/api/main.py.
    `health` is nullable BY DESIGN: a failure in the freshness query alone must not take the
    board down, and a null here means "keep the last known health", never "health is unknown". */
export type Board = {
  upcoming: UpcomingMatch[];
  in_play: InPlayItem[];
  completed: { total_graded: number; items: CompletedItem[] };
  health: Health | null;
};

export const paths = {
  health: () => "/health",
  board: () => "/board",
  upcoming: () => "/matches/upcoming",
  inPlay: () => "/matches/in-play",
  completed: (limit = 50, offset = 0) => `/predictions/completed?limit=${limit}&offset=${offset}`,
  performance: (scope: Scope) => `/performance?scope=${scope}`,
  methodology: () => "/methodology",
  matchDetail: (id: number) => `/matches/${id}`,
  verification: (id: number) => `/matches/${id}/verification`,
  ratings: (history = 0) => `/teams/ratings${history > 0 ? `?history=${history}` : ""}`,
  merkleRoots: (limit = 30) => `/merkle-roots?limit=${limit}`,
  activity: (hours = 48) => `/activity?hours=${hours}`,
  calibration: () => "/calibration",
  modelVersions: () => "/model-versions",
} as const;

/** Warm an endpoint ahead of a navigation. Fire-and-forget; see requestCache.prefetch. */
export function prefetchPath(path: string): void {
  prefetch(`${BASE}${path}`, path);
}

export const api = {
  health: () => get<Health>(paths.health()),
  board: () => get<Board>(paths.board()),
  upcoming: () => get<UpcomingMatch[]>(paths.upcoming()),
  inPlay: () => get<InPlayItem[]>(paths.inPlay()),
  completed: (limit = 50, offset = 0) =>
    get<{ total_graded: number; items: CompletedItem[] }>(paths.completed(limit, offset)),
  performance: (scope: Scope) => get<Performance>(paths.performance(scope)),
  methodology: () => get<Methodology>(paths.methodology()),
  matchDetail: (id: number) => get<MatchDetail>(paths.matchDetail(id)),
  verification: (id: number) => get<Verification>(paths.verification(id)),
  ratings: (history = 0) => get<TeamRatings>(paths.ratings(history)),
  merkleRoots: (limit = 30) =>
    get<{ repo: string | null; algorithm: string; items: MerkleRootItem[] }>(
      paths.merkleRoots(limit),
    ),
  activity: (hours = 48) =>
    get<{ window_hours: number; as_of_utc: string; items: ActivityItem[] }>(paths.activity(hours)),
  calibration: () => get<CalibrationResponse>(paths.calibration()),
  modelVersions: () => get<ModelVersion[]>(paths.modelVersions()),
};
