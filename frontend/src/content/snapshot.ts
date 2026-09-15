// Static data for the landing page, exported from the real models with
// `uv run python -m app.data.export_snapshot` (see backend/app/data/export_snapshot.py).
import raw from "./snapshot.json";

import type { ForecastPoint, ScaleAction, Status, UsagePoint } from "@/lib/types";

export interface SnapshotCluster {
  capacity_per_server: number;
  target_utilization: number;
  usage: UsagePoint[];
  forecast: ForecastPoint[];
  plan: { ts: string; servers: number; required: number }[];
  actions: ScaleAction[];
}

export interface Snapshot {
  generated_at: string;
  source: string;
  now: string;
  hero_cluster: string;
  actions_cluster: string;
  fleet: {
    id: string;
    name: string;
    description: string;
    status: Status;
    current_servers: number;
    recommended_servers: number;
    peak_servers: number;
    savings_7d: number;
    planned_cost_7d: number;
    static_peak_cost_7d: number;
    current_cost_7d: number;
  }[];
  clusters: Record<string, SnapshotCluster>;
  models: {
    cpu: {
      cluster_id: string;
      model_name: string;
      mae: number;
      rmse: number;
      smape: number;
      coverage_80: number;
      is_production: boolean;
    }[];
    series_total: number;
    lightgbm_wins: number;
    accuracy_cpu: number;
    coverage_range: [number, number];
  };
}

export const snapshot = raw as unknown as Snapshot;

export const GITHUB_URL = "https://github.com/noturbob/server-load-predictor";
