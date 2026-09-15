"""Turn load forecasts into a server plan, scaling actions and a cost summary.

Everything here is a pure function of (forecast frame, policy) so it is easy to unit-test.

forecast frame: index = hourly target timestamps (UTC), columns `cpu_p90`, `memory_p90`
(and optionally `cpu_p50`, `memory_p50`).
"""

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class ScalingPolicy:
    server_capacity: float = 100.0  # CPU load units one server handles at 100%
    server_memory_gb: float = 64.0
    target_utilization: float = 0.70
    min_servers: int = 2
    max_servers: int = 50
    cost_per_server_hour: float = 0.48
    lead_time_hours: int = 1
    scale_down_window: int = 6

    @classmethod
    def from_cluster(cls, cluster) -> "ScalingPolicy":
        return cls(**{f: getattr(cluster, f) for f in cls.__dataclass_fields__})


@dataclass
class ScaleAction:
    at: pd.Timestamp
    from_servers: int
    to_servers: int
    delta: int
    direction: str  # "up" | "down"
    urgency: str  # "critical" | "high" | "medium" | "low"
    reason: str
    driver: str  # "cpu" | "memory"

    def as_dict(self) -> dict:
        d = asdict(self)
        d["at"] = self.at.isoformat()
        return d


# --- 1. requirements ----------------------------------------------------------


def required_servers(forecast: pd.DataFrame, policy: ScalingPolicy) -> pd.DataFrame:
    """Servers needed each hour so p90 load stays under the target utilization."""
    cpu_per_server = policy.server_capacity * policy.target_utilization
    mem_per_server = policy.server_memory_gb * policy.target_utilization
    by_cpu = np.ceil(forecast["cpu_p90"].to_numpy() / cpu_per_server - 1e-9).astype(int)
    by_mem = np.ceil(forecast["memory_p90"].to_numpy() / mem_per_server - 1e-9).astype(int)
    required = np.clip(np.maximum(by_cpu, by_mem), policy.min_servers, policy.max_servers)
    return pd.DataFrame(
        {
            "by_cpu": by_cpu,
            "by_memory": by_mem,
            "required": required,
            "driver": np.where(by_mem > by_cpu, "memory", "cpu"),
        },
        index=forecast.index,
    )


# --- 2. lead time -------------------------------------------------------------


def apply_lead_time(required: np.ndarray, lead_hours: int) -> np.ndarray:
    """Servers must already be running `lead_hours` before they are needed."""
    if lead_hours <= 0:
        return required.copy()
    n = len(required)
    return np.array([required[i : min(n, i + lead_hours + 1)].max() for i in range(n)])


# --- 3. hysteresis ------------------------------------------------------------


def smooth_plan(need: np.ndarray, current: int, scale_down_window: int) -> np.ndarray:
    """Scale up immediately; scale down only when the need stays lower for a full window.

    When scaling down we drop to the highest need inside the window, so the plan does not
    immediately have to scale back up again.
    """
    plan = np.empty(len(need), dtype=int)
    level = int(current)
    window = max(1, scale_down_window)
    for i, n in enumerate(need):
        if n > level:
            level = int(n)
        elif n < level and i + window <= len(need):
            upcoming = int(need[i : i + window].max())
            level = min(level, upcoming)
        plan[i] = level
    return plan


# --- 4. actions ---------------------------------------------------------------


def _urgency(hours_until: float) -> str:
    if hours_until <= 1:
        return "critical"
    if hours_until <= 6:
        return "high"
    if hours_until <= 24:
        return "medium"
    return "low"


def _fmt(ts: pd.Timestamp) -> str:
    return ts.strftime("%a %H:%M")


def build_actions(
    plan: np.ndarray,
    current: int,
    forecast: pd.DataFrame,
    req: pd.DataFrame,
    policy: ScalingPolicy,
    now: pd.Timestamp,
) -> list[ScaleAction]:
    """Diff consecutive plan steps; merge back-to-back steps in the same direction."""
    index = forecast.index
    steps: list[tuple[int, int, int]] = []  # (position, from, to)
    prev = current
    for i, servers in enumerate(plan):
        if servers != prev:
            steps.append((i, prev, int(servers)))
            prev = int(servers)

    merged: list[tuple[int, int, int, int]] = []  # (start_pos, end_pos, from, to)
    for pos, frm, to in steps:
        if merged:
            s, e, mfrm, mto = merged[-1]
            same_dir = (to > frm) == (mto > mfrm)
            if same_dir and pos == e + 1:
                merged[-1] = (s, pos, mfrm, to)
                continue
        merged.append((pos, pos, frm, to))

    target = policy.target_utilization
    actions = []
    for start, end, frm, to in merged:
        at = index[start]
        direction = "up" if to > frm else "down"
        window = slice(start, min(len(index), end + max(policy.scale_down_window, policy.lead_time_hours) + 1))
        driver = "memory" if (req["driver"].iloc[window] == "memory").mean() > 0.5 else "cpu"
        col, unit = ("memory_p90", "GB memory") if driver == "memory" else ("cpu_p90", "CPU units")
        if direction == "up":
            peak_pos = int(np.argmax(forecast[col].iloc[window].to_numpy())) + window.start
            reason = (
                f"Forecast peak of {forecast[col].iloc[peak_pos]:,.0f} {unit} (p90) at "
                f"{_fmt(index[peak_pos])} needs {to} servers at {target:.0%} target utilization."
            )
        else:
            hold = int(policy.scale_down_window)
            peak = forecast[col].iloc[start : start + hold].max()
            reason = (
                f"Load stays below {peak:,.0f} {unit} (p90) for the next {hold}h; "
                f"{to} servers keep utilization under {target:.0%}."
            )
        hours_until = (at - now).total_seconds() / 3600
        actions.append(
            ScaleAction(
                at=at,
                from_servers=frm,
                to_servers=to,
                delta=to - frm,
                direction=direction,
                urgency=_urgency(hours_until) if direction == "up" else "low",
                reason=reason,
                driver=driver,
            )
        )
    return actions


# --- 5 & 6. cost and status ---------------------------------------------------


def cost_summary(plan: np.ndarray, required: np.ndarray, current: int, policy: ScalingPolicy) -> dict:
    hours = len(plan)
    rate = policy.cost_per_server_hour
    planned = float(plan.sum() * rate)
    static_peak = float(required.max() * hours * rate) if hours else 0.0
    current_cost = float(current * hours * rate)
    return {
        "hours": hours,
        "planned_cost": round(planned, 2),
        "static_peak_cost": round(static_peak, 2),
        "current_cost": round(current_cost, 2),
        "savings_vs_static": round(static_peak - planned, 2),
        "savings_vs_current": round(current_cost - planned, 2),
        "savings_pct_vs_static": round((static_peak - planned) / static_peak * 100, 1) if static_peak else 0.0,
        "planned_server_hours": int(plan.sum()),
        "hours_at_risk": int((required > current).sum()),
        "hours_over_provisioned": int((current > required).sum()),
    }


def cluster_status(required: np.ndarray, current: int) -> str:
    next_2h = required[:2]
    next_24h = required[:24]
    if len(next_2h) and next_2h.max() > current:
        return "at_risk"
    if len(next_24h) and next_24h.max() > current:
        return "scale_up_soon"
    if len(next_24h) and current - next_24h.max() >= 2:
        return "over_provisioned"
    return "healthy"


# --- entry point --------------------------------------------------------------


def recommend(forecast: pd.DataFrame, policy: ScalingPolicy, current_servers: int, now: pd.Timestamp) -> dict:
    req = required_servers(forecast, policy)
    required = req["required"].to_numpy()
    need = apply_lead_time(required, policy.lead_time_hours)
    plan = smooth_plan(need, current_servers, policy.scale_down_window)
    actions = build_actions(plan, current_servers, forecast, req, policy, now)

    plan_rows = [
        {
            "ts": ts.isoformat(),
            "servers": int(plan[i]),
            "required": int(required[i]),
            "cpu_p90": round(float(forecast["cpu_p90"].iloc[i]), 2),
            "memory_p90": round(float(forecast["memory_p90"].iloc[i]), 2),
        }
        for i, ts in enumerate(forecast.index)
    ]
    return {
        "status": cluster_status(required, current_servers),
        "current_servers": int(current_servers),
        "recommended_now": int(plan[0]) if len(plan) else int(current_servers),
        "peak_required": int(required.max()) if len(required) else 0,
        "plan": plan_rows,
        "actions": [a.as_dict() for a in actions],
        "cost": cost_summary(plan, required, current_servers, policy),
    }


def forecast_frame(cpu: pd.DataFrame, memory: pd.DataFrame) -> pd.DataFrame:
    """Combine per-metric forecasts (p10/p50/p90 columns) into the recommender's input."""
    return pd.DataFrame(
        {
            "cpu_p50": cpu["p50"],
            "cpu_p90": cpu["p90"],
            "memory_p50": memory["p50"],
            "memory_p90": memory["p90"],
        }
    ).dropna()

