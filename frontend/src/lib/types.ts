// Mirrors backend/app/schemas.py — keep in sync.

export type Metric = "cpu" | "memory" | "network";
export type Status = "healthy" | "scale_up_soon" | "over_provisioned" | "at_risk";

export interface ClusterConfig {
  server_capacity: number;
  server_memory_gb: number;
  target_utilization: number;
  min_servers: number;
  max_servers: number;
  cost_per_server_hour: number;
  lead_time_hours: number;
  scale_down_window: number;
  current_servers: number;
}

export type ClusterConfigUpdate = Partial<ClusterConfig>;

export interface UsageSnapshot {
  ts: string;
  cpu: number;
  memory: number;
  network: number;
}

export interface SparkPoint {
  ts: string;
  actual: number | null;
  forecast: number | null;
}

export interface ScaleAction {
  at: string;
  from_servers: number;
  to_servers: number;
  delta: number;
  direction: "up" | "down";
  urgency: "critical" | "high" | "medium" | "low";
  reason: string;
  driver: "cpu" | "memory";
}

export interface CostSummary {
  hours: number;
  planned_cost: number;
  static_peak_cost: number;
  current_cost: number;
  savings_vs_static: number;
  savings_vs_current: number;
  savings_pct_vs_static: number;
  planned_server_hours: number;
  hours_at_risk: number;
  hours_over_provisioned: number;
}

export interface ClusterSummary {
  id: string;
  name: string;
  description: string;
  config: ClusterConfig;
  status: Status;
  current_servers: number;
  recommended_servers: number;
  peak_required_servers: number;
  latest: UsageSnapshot | null;
  sparkline: SparkPoint[];
  weekly_cost: CostSummary;
  upcoming_actions: ScaleAction[];
}

export interface UsagePoint {
  ts: string;
  value: number;
}

export interface UsageResponse {
  cluster_id: string;
  metric: Metric;
  now: string;
  points: UsagePoint[];
}

export interface ForecastPoint {
  ts: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface ForecastResponse {
  cluster_id: string;
  metric: Metric;
  model: string;
  origin: string;
  points: ForecastPoint[];
}

export interface HistoryPoint {
  ts: string;
  actual: number;
  pred_1h: number | null;
  pred_24h: number | null;
  p10_24h: number | null;
  p90_24h: number | null;
}

export interface HistoryVsPredictedResponse {
  cluster_id: string;
  metric: Metric;
  points: HistoryPoint[];
  mae_1h: number | null;
  mae_24h: number | null;
}

export interface PlanPoint {
  ts: string;
  servers: number;
  required: number;
  cpu_p90: number;
  memory_p90: number;
}

export interface RecommendationResponse {
  cluster_id: string;
  generated_at: string;
  status: Status;
  current_servers: number;
  recommended_now: number;
  peak_required: number;
  plan: PlanPoint[];
  actions: ScaleAction[];
  cost: CostSummary;
}

export interface ModelMetric {
  model_name: string;
  cluster_id: string;
  metric: Metric;
  mae: number;
  rmse: number;
  smape: number;
  coverage_80: number;
  trained_at: string;
  train_end: string;
  is_production: boolean;
}

export interface RetrainJob {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
  message: string;
  error: string | null;
}

export interface SimulationState {
  now: string;
  start: string;
  end: string;
  running: boolean;
  tick_seconds: number;
  progress: number;
}

export interface Health {
  status: "ok";
  sim_now: string | null;
  models_loaded: number;
  data_source: string | null;
}
