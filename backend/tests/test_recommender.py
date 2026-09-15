import numpy as np
import pandas as pd

from app.recommender.engine import (
    ScalingPolicy,
    apply_lead_time,
    cluster_status,
    recommend,
    required_servers,
    smooth_plan,
)

NOW = pd.Timestamp("2025-11-03T00:00:00Z")
POLICY = ScalingPolicy(
    server_capacity=100,
    server_memory_gb=64,
    target_utilization=0.5,  # 50 CPU units / 32 GB per server
    min_servers=2,
    max_servers=20,
    cost_per_server_hour=1.0,
    lead_time_hours=1,
    scale_down_window=6,
)


def frame(cpu: list[float], memory: list[float] | None = None) -> pd.DataFrame:
    idx = NOW + pd.to_timedelta(np.arange(1, len(cpu) + 1), unit="h")
    memory = memory if memory is not None else [0.0] * len(cpu)
    return pd.DataFrame({"cpu_p90": cpu, "memory_p90": memory}, index=idx)


def test_flat_load_produces_no_actions():
    rec = recommend(frame([200.0] * 48), POLICY, current_servers=4, now=NOW)
    assert rec["actions"] == []
    assert rec["recommended_now"] == 4
    assert rec["status"] == "healthy"
    assert rec["cost"]["savings_vs_current"] == 0


def test_rising_load_scales_up_before_peak():
    cpu = [200.0] * 10 + [400.0] * 10  # 4 servers -> 8 servers from hour index 10
    rec = recommend(frame(cpu), POLICY, current_servers=4, now=NOW)
    ups = [a for a in rec["actions"] if a["direction"] == "up"]
    assert len(ups) == 1
    action = ups[0]
    assert action["to_servers"] == 8 and action["delta"] == 4
    # Lead time of 1h: servers must be ready one hour before the peak starts at index 10.
    peak_ts = frame(cpu).index[10]
    assert pd.Timestamp(action["at"]) == peak_ts - pd.Timedelta(hours=1)
    assert "400" in action["reason"]


def test_brief_dip_does_not_scale_down():
    cpu = [400.0] * 10 + [100.0] * 3 + [400.0] * 10
    rec = recommend(frame(cpu), POLICY, current_servers=8, now=NOW)
    assert rec["actions"] == []
    assert all(p["servers"] == 8 for p in rec["plan"])


def test_sustained_drop_scales_down():
    cpu = [400.0] * 5 + [100.0] * 30
    rec = recommend(frame(cpu), POLICY, current_servers=8, now=NOW)
    downs = [a for a in rec["actions"] if a["direction"] == "down"]
    assert len(downs) == 1
    assert downs[0]["to_servers"] == 2
    assert rec["cost"]["savings_vs_current"] > 0


def test_required_servers_clamped_and_memory_driven():
    req = required_servers(frame([10.0, 5000.0, 50.0], memory=[0.0, 0.0, 320.0]), POLICY)
    assert req["required"].tolist() == [2, 20, 10]  # min clamp, max clamp, memory needs 10
    assert req["driver"].tolist() == ["cpu", "cpu", "memory"]


def test_lead_time_and_smoothing_helpers():
    assert apply_lead_time(np.array([1, 1, 5, 1]), 1).tolist() == [1, 5, 5, 1]
    assert apply_lead_time(np.array([1, 5]), 0).tolist() == [1, 5]
    plan = smooth_plan(np.array([5, 5, 1, 1, 1, 1]), current=5, scale_down_window=2)
    assert plan.tolist() == [5, 5, 1, 1, 1, 1]


def test_cost_math():
    cpu = [100.0] * 12 + [400.0] * 12  # required 2 then 8
    rec = recommend(frame(cpu), ScalingPolicy(**{**POLICY.__dict__, "lead_time_hours": 0}), 8, NOW)
    cost = rec["cost"]
    assert cost["hours"] == 24
    assert cost["static_peak_cost"] == 8 * 24
    assert cost["current_cost"] == 8 * 24
    assert cost["planned_cost"] == 2 * 12 + 8 * 12
    assert cost["savings_vs_static"] == 8 * 24 - (2 * 12 + 8 * 12)
    assert cost["hours_at_risk"] == 0
    assert cost["hours_over_provisioned"] == 12


def test_status():
    assert cluster_status(np.array([6, 4]), current=5) == "at_risk"
    assert cluster_status(np.array([4, 4, 4, 6]), current=5) == "scale_up_soon"
    assert cluster_status(np.array([3] * 24), current=5) == "over_provisioned"
    assert cluster_status(np.array([5] * 24), current=5) == "healthy"
