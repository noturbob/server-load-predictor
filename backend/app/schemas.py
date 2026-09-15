"""API response/request models. Timestamps are ISO-8601 strings in UTC.

Keep `frontend/src/lib/types.ts` in sync with this file.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Metric = Literal["cpu", "memory", "network"]
Status = Literal["healthy", "scale_up_soon", "over_provisioned", "at_risk"]


class ClusterConfig(BaseModel):
    server_capacity: float
    server_memory_gb: float
    target_utilization: float
    min_servers: int
    max_servers: int
    cost_per_server_hour: float
    lead_time_hours: int
    scale_down_window: int
    current_servers: int


class ClusterConfigUpdate(BaseModel):
    server_capacity: float | None = Field(None, gt=0, le=100_000)
    server_memory_gb: float | None = Field(None, gt=0, le=10_000)
    target_utilization: float | None = Field(None, ge=0.1, le=1.0)
    min_servers: int | None = Field(None, ge=0, le=10_000)
    max_servers: int | None = Field(None, ge=1, le=10_000)
    cost_per_server_hour: float | None = Field(None, ge=0, le=1_000)
    lead_time_hours: int | None = Field(None, ge=0, le=48)
    scale_down_window: int | None = Field(None, ge=1, le=72)
    current_servers: int | None = Field(None, ge=0, le=10_000)

    @model_validator(mode="after")
    def _min_le_max(self):
        both_set = self.min_servers is not None and self.max_servers is not None
        if both_set and self.min_servers > self.max_servers:
            raise ValueError("min_servers must be <= max_servers")
        return self


class UsageSnapshot(BaseModel):
    ts: str
    cpu: float
    memory: float
    network: float


class SparkPoint(BaseModel):
    ts: str
    actual: float | None = None
    forecast: float | None = None


class ScaleAction(BaseModel):
    at: str
    from_servers: int
    to_servers: int
    delta: int
    direction: Literal["up", "down"]
    urgency: Literal["critical", "high", "medium", "low"]
    reason: str
    driver: Literal["cpu", "memory"]


class CostSummary(BaseModel):
    hours: int
    planned_cost: float
    static_peak_cost: float
    current_cost: float
    savings_vs_static: float
    savings_vs_current: float
    savings_pct_vs_static: float
    planned_server_hours: int
    hours_at_risk: int
    hours_over_provisioned: int


class ClusterSummary(BaseModel):
    id: str
    name: str
    description: str
    config: ClusterConfig
    status: Status
    current_servers: int
    recommended_servers: int
    peak_required_servers: int
    latest: UsageSnapshot | None
    sparkline: list[SparkPoint]
    weekly_cost: CostSummary
    upcoming_actions: list[ScaleAction]


class UsagePoint(BaseModel):
    ts: str
    value: float


class UsageResponse(BaseModel):
    cluster_id: str
    metric: Metric
    now: str
    points: list[UsagePoint]


class ForecastPoint(BaseModel):
    ts: str
    p10: float
    p50: float
    p90: float


class ForecastResponse(BaseModel):
    cluster_id: str
    metric: Metric
    model: str
    origin: str
    points: list[ForecastPoint]


class HistoryPoint(BaseModel):
    ts: str
    actual: float
    pred_1h: float | None = None
    pred_24h: float | None = None
    p10_24h: float | None = None
    p90_24h: float | None = None


class HistoryVsPredictedResponse(BaseModel):
    cluster_id: str
    metric: Metric
    points: list[HistoryPoint]
    mae_1h: float | None
    mae_24h: float | None


class PlanPoint(BaseModel):
    ts: str
    servers: int
    required: int
    cpu_p90: float
    memory_p90: float


class RecommendationResponse(BaseModel):
    cluster_id: str
    generated_at: str
    status: Status
    current_servers: int
    recommended_now: int
    peak_required: int
    plan: list[PlanPoint]
    actions: list[ScaleAction]
    cost: CostSummary


class ModelMetric(BaseModel):
    model_name: str
    cluster_id: str
    metric: Metric
    mae: float
    rmse: float
    smape: float
    coverage_80: float
    trained_at: str
    train_end: str
    is_production: bool


class RetrainJob(BaseModel):
    id: str
    status: Literal["queued", "running", "done", "failed"]
    started_at: str
    finished_at: str | None = None
    message: str = ""
    error: str | None = None


class SimulationState(BaseModel):
    now: str
    start: str
    end: str
    running: bool
    tick_seconds: float
    progress: float


class Health(BaseModel):
    status: Literal["ok"]
    sim_now: str | None
    models_loaded: int
    data_source: str | None
