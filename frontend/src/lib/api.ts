import type {
  ClusterConfig,
  ClusterConfigUpdate,
  ClusterSummary,
  ForecastResponse,
  Health,
  HistoryVsPredictedResponse,
  Metric,
  ModelMetric,
  RecommendationResponse,
  RetrainJob,
  SimulationState,
  UsageResponse,
} from "@/lib/types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined>;

async function request<T>(path: string, init?: RequestInit & { query?: Query }): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [key, value] of Object.entries(init?.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_URL}`, 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/health"),

  clusters: () => request<ClusterSummary[]>("/clusters"),
  cluster: (id: string) => request<ClusterSummary>(`/clusters/${id}`),
  updateConfig: (id: string, body: ClusterConfigUpdate) =>
    request<ClusterConfig>(`/clusters/${id}/config`, { method: "PATCH", body: JSON.stringify(body) }),

  usage: (id: string, metric: Metric, hours: number) =>
    request<UsageResponse>(`/clusters/${id}/usage`, { query: { metric, hours } }),
  forecast: (id: string, metric: Metric, horizon: number, model = "best") =>
    request<ForecastResponse>(`/clusters/${id}/forecast`, { query: { metric, horizon, model } }),
  historyVsPredicted: (id: string, metric: Metric, hours: number) =>
    request<HistoryVsPredictedResponse>(`/clusters/${id}/history-vs-predicted`, { query: { metric, hours } }),
  recommendations: (id: string, horizon: number) =>
    request<RecommendationResponse>(`/clusters/${id}/recommendations`, { query: { horizon } }),

  modelMetrics: () => request<ModelMetric[]>("/models/metrics"),
  retrain: () => request<RetrainJob>("/models/retrain", { method: "POST" }),
  retrainStatus: (jobId: string) => request<RetrainJob>(`/models/retrain/${jobId}`),

  simulation: () => request<SimulationState>("/simulation"),
  simulationAction: (action: "play" | "pause" | "reset") =>
    request<SimulationState>(`/simulation/${action}`, { method: "POST" }),
  simulationStep: (hours: number) =>
    request<SimulationState>("/simulation/step", { method: "POST", query: { hours } }),
};
