"""Realistic synthetic usage data for three clusters.

Each series is built multiplicatively:
    load = base x trend x daily x weekly x events x noise
where noise is an AR(1) process in log space (errors persist for a few hours, like real traffic).
Memory lags CPU (an exponential moving average plus a baseline) and network tracks CPU.
"""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class ClusterSpec:
    id: str
    name: str
    description: str
    current_servers: int
    config: dict = field(default_factory=dict)


CLUSTER_SPECS: list[ClusterSpec] = [
    ClusterSpec(
        id="web-frontend",
        name="Web Frontend",
        description="Customer-facing web servers. Strong daytime peak, quieter weekends, growing.",
        current_servers=16,
        config={"cost_per_server_hour": 0.48, "min_servers": 4, "max_servers": 40},
    ),
    ClusterSpec(
        id="api-gateway",
        name="API Gateway",
        description="Public API traffic with weekly seasonality and sudden spikes.",
        current_servers=12,
        config={"cost_per_server_hour": 0.38, "min_servers": 3, "max_servers": 40},
    ),
    ClusterSpec(
        id="batch-jobs",
        name="Batch Jobs",
        description="Nightly ETL between 00:00 and 05:00 and a month-end reporting surge.",
        current_servers=10,
        config={"cost_per_server_hour": 0.62, "min_servers": 2, "max_servers": 30},
    ),
]


def _gauss(x: np.ndarray, mu: float, sigma: float) -> np.ndarray:
    return np.exp(-(((x - mu) / sigma) ** 2))


def _ar1_noise(rng: np.random.Generator, n: int, phi: float, sigma: float) -> np.ndarray:
    eps = rng.normal(0.0, sigma, n)
    out = np.empty(n)
    out[0] = eps[0]
    for i in range(1, n):
        out[i] = phi * out[i - 1] + eps[i]
    return np.exp(out)


def _event(index: pd.DatetimeIndex, day: str, peak: float, ramp_days: float = 0.5) -> np.ndarray:
    """Multiplier that rises smoothly to `peak` over the given day (e.g. Black Friday)."""
    center = pd.Timestamp(day, tz="UTC") + pd.Timedelta(hours=14)
    hours = (index - center).total_seconds().to_numpy() / 3600.0
    return 1.0 + (peak - 1.0) * _gauss(hours, 0.0, 24.0 * ramp_days)


def _ema(x: np.ndarray, alpha: float) -> np.ndarray:
    out = np.empty_like(x)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = alpha * x[i] + (1 - alpha) * out[i - 1]
    return out


def _spikes(rng: np.random.Generator, n: int, rate_per_hour: float) -> np.ndarray:
    mult = np.ones(n)
    starts = np.flatnonzero(rng.random(n) < rate_per_hour)
    for s in starts:
        duration = int(rng.integers(2, 7))
        magnitude = rng.uniform(1.5, 2.5)
        shape = np.sin(np.linspace(0, np.pi, duration + 2))[1:-1]
        end = min(n, s + duration)
        mult[s:end] = np.maximum(mult[s:end], 1 + (magnitude - 1) * shape[: end - s])
    return mult


def generate(start: str, days: int, seed: int = 42) -> dict[str, pd.DataFrame]:
    """Return {cluster_id: DataFrame[ts index (UTC, hourly), cpu, memory, network]}."""
    rng = np.random.default_rng(seed)
    index = pd.date_range(pd.Timestamp(start), periods=days * 24, freq="h", tz="UTC")
    n = len(index)
    hour = index.hour.to_numpy().astype(float)
    dow = index.dayofweek.to_numpy()
    t = np.arange(n) / n
    days_in_month = index.days_in_month.to_numpy()
    day_of_month = index.day.to_numpy()

    out: dict[str, pd.DataFrame] = {}

    # --- web-frontend -------------------------------------------------------
    daily = 0.35 + 0.65 * _gauss(hour, 14, 4.5) + 0.25 * _gauss(hour, 20.5, 1.8)
    weekly = np.select([dow == 5, dow == 6], [0.78, 0.72], 1.0)
    trend = 1 + 0.15 * t
    events = _event(index, "2025-09-16", 1.5) * _event(index, "2025-11-28", 2.1, ramp_days=0.7)
    cpu = 760 * trend * daily * weekly * events * _ar1_noise(rng, n, 0.75, 0.045)
    out["web-frontend"] = _finish(rng, index, cpu, mem_base=110, mem_k=0.36, net_k=2.6)

    # --- api-gateway --------------------------------------------------------
    daily = 0.5 + 0.5 * _gauss(hour, 11, 5)
    weekly = np.select([dow == 5, dow == 6], [0.84, 0.8], 1.0)
    weekly = weekly * np.where(dow == 1, 1.06, 1.0)  # Tuesday release traffic
    trend = 1 + 0.08 * t
    events = _event(index, "2025-11-28", 1.7, ramp_days=0.7)
    spikes = _spikes(rng, n, rate_per_hour=1 / 110)
    cpu = 620 * trend * daily * weekly * events * spikes * _ar1_noise(rng, n, 0.7, 0.05)
    out["api-gateway"] = _finish(rng, index, cpu, mem_base=90, mem_k=0.3, net_k=4.1)

    # --- batch-jobs ---------------------------------------------------------
    nightly = 1 + 2.4 * ((hour >= 0) & (hour < 5)) * (0.85 + 0.15 * np.sin(hour))
    month_end = np.where(day_of_month >= days_in_month - 1, 1.6, 1.0)
    weekly = np.where(dow == 6, 0.85, 1.0)
    cpu = 210 * nightly * month_end * weekly * _ar1_noise(rng, n, 0.6, 0.06)
    out["batch-jobs"] = _finish(rng, index, cpu, mem_base=70, mem_k=0.55, net_k=1.2)

    return out


def _finish(rng, index, cpu, mem_base: float, mem_k: float, net_k: float) -> pd.DataFrame:
    cpu = np.clip(cpu, 1.0, None)
    memory = mem_base + mem_k * _ema(cpu, 0.25) * rng.normal(1.0, 0.015, len(cpu))
    network = net_k * cpu * rng.lognormal(0.0, 0.08, len(cpu))
    return pd.DataFrame(
        {
            "cpu": np.round(cpu, 2),
            "memory": np.round(np.clip(memory, 1.0, None), 2),
            "network": np.round(np.clip(network, 0.0, None), 2),
        },
        index=pd.DatetimeIndex(index, name="ts"),
    )
