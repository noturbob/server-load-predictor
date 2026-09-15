"""Export a static snapshot of real forecasts for the landing page.

    uv run python -m app.data.export_snapshot [--out ../frontend/src/content/snapshot.json]

The snapshot is taken at the simulation start with the seeded cluster settings, so it is
deterministic and doesn't depend on edits made in the dashboard. Requires seeded data and
trained models.
"""

import argparse
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import select

from app.config import BACKEND_DIR
from app.data.store import get_meta, get_meta_ts, load_series
from app.data.synthetic import CLUSTER_SPECS
from app.db import init_db, session_scope
from app.ml import registry
from app.models import Cluster
from app.recommender import engine
from app.services import forecast_service, model_metrics

log = logging.getLogger(__name__)
DEFAULT_OUT = BACKEND_DIR.parent / "frontend" / "src" / "content" / "snapshot.json"
HERO_CLUSTER = "web-frontend"
ACTIONS_CLUSTER = "batch-jobs"


def _r(v: float, digits: int = 1) -> float:
    return round(float(v), digits)


def build_snapshot() -> dict:
    init_db()
    if not registry.has_artifacts():
        raise RuntimeError("No trained models. Run `python -m app.ml.train` first.")
    forecast_service.reload()
    specs = {s.id: s for s in CLUSTER_SPECS}

    with session_scope() as session:
        now = get_meta_ts(session, "sim_start")
        clusters = session.scalars(select(Cluster).order_by(Cluster.name)).all()

        fleet = []
        detail: dict[str, dict] = {}
        for c in clusters:
            spec = specs[c.id]
            policy = engine.ScalingPolicy(**spec.config)
            _, cpu = forecast_service.forecast(session, c.id, "cpu", now, 168)
            _, mem = forecast_service.forecast(session, c.id, "memory", now, 168)
            rec = engine.recommend(engine.forecast_frame(cpu, mem), policy, spec.current_servers, now)
            usage = load_series(session, c.id, "cpu", start=now - pd.Timedelta(hours=71), end=now)
            fleet.append(
                {
                    "id": c.id,
                    "name": c.name,
                    "description": c.description,
                    "status": rec["status"],
                    "current_servers": spec.current_servers,
                    "recommended_servers": rec["recommended_now"],
                    "peak_servers": rec["peak_required"],
                    "savings_7d": rec["cost"]["savings_vs_current"],
                    "planned_cost_7d": rec["cost"]["planned_cost"],
                    "static_peak_cost_7d": rec["cost"]["static_peak_cost"],
                    "current_cost_7d": rec["cost"]["current_cost"],
                }
            )
            detail[c.id] = {
                "capacity_per_server": policy.server_capacity * policy.target_utilization,
                "target_utilization": policy.target_utilization,
                "usage": [{"ts": ts.isoformat(), "value": _r(v)} for ts, v in usage.items()],
                "forecast": [
                    {"ts": ts.isoformat(), "p10": _r(r.p10), "p50": _r(r.p50), "p90": _r(r.p90)} for ts, r in cpu.iterrows()
                ],
                "plan": [{"ts": p["ts"], "servers": p["servers"], "required": p["required"]} for p in rec["plan"]],
                "actions": rec["actions"][:4],
            }

        metrics = [m for m in model_metrics(session) if m["metric"] == "cpu"]
        all_metrics = model_metrics(session)
        source = get_meta(session, "source")

    series = {(m["cluster_id"], m["metric"]) for m in all_metrics}
    lgbm_wins = sum(
        1
        for key in series
        if min((m for m in all_metrics if (m["cluster_id"], m["metric"]) == key), key=lambda m: m["mae"])["model_name"]
        == "lightgbm"
    )
    production_cpu = [m for m in metrics if m["is_production"]]
    return {
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "source": source,
        "now": now.isoformat(),
        "hero_cluster": HERO_CLUSTER,
        "actions_cluster": ACTIONS_CLUSTER,
        "fleet": fleet,
        "clusters": detail,
        "models": {
            "cpu": [
                {k: m[k] for k in ("cluster_id", "model_name", "mae", "rmse", "smape", "coverage_80", "is_production")}
                for m in metrics
            ],
            "series_total": len(series),
            "lightgbm_wins": lgbm_wins,
            "accuracy_cpu": _r(100 - sum(m["smape"] for m in production_cpu) / len(production_cpu)),
            "coverage_range": [
                _r(min(m["coverage_80"] for m in all_metrics if m["is_production"]) * 100, 0),
                _r(max(m["coverage_80"] for m in all_metrics if m["is_production"]) * 100, 0),
            ],
        },
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    snapshot = build_snapshot()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(snapshot, separators=(",", ":")) + "\n")
    log.info("Wrote %s (%.0f KB)", args.out, args.out.stat().st_size / 1024)


if __name__ == "__main__":
    main()
