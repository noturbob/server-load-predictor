"""Orchestration between the database, trained models and the recommender.

The API layer calls these functions; they never look past the simulation clock's "now".
"""

import threading
from collections.abc import Iterable

import numpy as np
import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.data.store import load_series, load_usage, to_naive_utc, to_utc
from app.ml import registry
from app.models import METRICS, Cluster, Forecast, ModelRun
from app.recommender import engine

HISTORY_HOURS = 35 * 24  # enough for every model's features
PERSISTED_HORIZONS = (1, 24)
SPARK_HOURS = 24


class ForecastService:
    def __init__(self) -> None:
        self._models: dict[tuple[str, str], registry.SeriesModels] = {}
        self._cache: dict[tuple, pd.DataFrame] = {}
        self._cache_now: pd.Timestamp | None = None
        self._lock = threading.RLock()

    # -- models -----------------------------------------------------------------

    def reload(self) -> None:
        models = registry.load_all()
        with self._lock:
            self._models = models
            self._cache.clear()

    @property
    def loaded(self) -> int:
        return len(self._models)

    def entry(self, cluster_id: str, metric: str) -> registry.SeriesModels:
        try:
            return self._models[(cluster_id, metric)]
        except KeyError:
            raise LookupError(
                f"No trained model for {cluster_id}/{metric}. Run `python -m app.ml.train`."
            ) from None

    def production_models(self) -> dict[tuple[str, str], str]:
        return {key: e.best_model for key, e in self._models.items()}

    # -- forecasting ------------------------------------------------------------

    def forecast(
        self,
        session: Session,
        cluster_id: str,
        metric: str,
        now: pd.Timestamp,
        horizon: int = 168,
        model: str = "best",
    ) -> tuple[str, pd.DataFrame]:
        entry = self.entry(cluster_id, metric)
        name = entry.best_model if model in (None, "best") else model
        forecaster = entry.get(name)
        key = (cluster_id, metric, name)
        with self._lock:
            if self._cache_now != now:
                self._cache.clear()
                self._cache_now = now
            cached = self._cache.get(key)
        if cached is None:
            history = load_series(session, cluster_id, metric, start=now - pd.Timedelta(hours=HISTORY_HOURS), end=now)
            cached = forecaster.predict(history, 168)
            with self._lock:
                if self._cache_now == now:
                    self._cache[key] = cached
        return name, cached.iloc[:horizon]

    def persist(self, session: Session, origins: Iterable[pd.Timestamp]) -> int:
        """Store 1h- and 24h-ahead production forecasts made at each origin."""
        origins = sorted(pd.Timestamp(o) for o in origins)
        if not origins or not self._models:
            return 0
        rows = []
        for (cluster_id, metric), entry in self._models.items():
            model = entry.get()
            series = load_series(
                session,
                cluster_id,
                metric,
                start=origins[0] - pd.Timedelta(hours=HISTORY_HOURS),
                end=origins[-1],
            )
            for origin in origins:
                history = series.loc[origin - pd.Timedelta(hours=HISTORY_HOURS) : origin]
                pred = model.predict(history, list(PERSISTED_HORIZONS))
                for h, (target, r) in zip(PERSISTED_HORIZONS, pred.iterrows()):
                    rows.append(
                        {
                            "cluster_id": cluster_id,
                            "metric": metric,
                            "model_name": entry.best_model,
                            "origin_ts": to_naive_utc(origin),
                            "horizon": h,
                            "target_ts": to_naive_utc(target),
                            "p10": float(r.p10),
                            "p50": float(r.p50),
                            "p90": float(r.p90),
                        }
                    )
        for i in range(0, len(rows), 1000):  # stay under SQLite's bound-parameter limit
            session.execute(sqlite_insert(Forecast).values(rows[i : i + 1000]).on_conflict_do_nothing())
        return len(rows)


forecast_service = ForecastService()


# --- clusters -------------------------------------------------------------------


def cluster_config(c: Cluster) -> dict:
    return {
        "server_capacity": c.server_capacity,
        "server_memory_gb": c.server_memory_gb,
        "target_utilization": c.target_utilization,
        "min_servers": c.min_servers,
        "max_servers": c.max_servers,
        "cost_per_server_hour": c.cost_per_server_hour,
        "lead_time_hours": c.lead_time_hours,
        "scale_down_window": c.scale_down_window,
        "current_servers": c.current_servers,
    }


def recommendation(session: Session, cluster: Cluster, now: pd.Timestamp, horizon: int = 168) -> dict:
    _, cpu = forecast_service.forecast(session, cluster.id, "cpu", now, horizon)
    _, mem = forecast_service.forecast(session, cluster.id, "memory", now, horizon)
    frame = engine.forecast_frame(cpu, mem)
    policy = engine.ScalingPolicy.from_cluster(cluster)
    rec = engine.recommend(frame, policy, cluster.current_servers, now)
    return {"cluster_id": cluster.id, "generated_at": now.isoformat(), **rec}


def cluster_summary(session: Session, cluster: Cluster, now: pd.Timestamp) -> dict:
    usage = load_usage(session, cluster.id, start=now - pd.Timedelta(hours=SPARK_HOURS - 1), end=now)
    latest = None
    if len(usage):
        ts, row = usage.index[-1], usage.iloc[-1]
        latest = {"ts": ts.isoformat(), "cpu": row.cpu, "memory": row.memory, "network": row.network}

    rec = recommendation(session, cluster, now)
    _, cpu_fc = forecast_service.forecast(session, cluster.id, "cpu", now, SPARK_HOURS)
    sparkline = [{"ts": ts.isoformat(), "actual": float(v), "forecast": None} for ts, v in usage["cpu"].items()]
    if sparkline:  # connect the two lines at "now"
        sparkline[-1]["forecast"] = sparkline[-1]["actual"]
    sparkline += [{"ts": ts.isoformat(), "actual": None, "forecast": float(v)} for ts, v in cpu_fc["p50"].items()]

    return {
        "id": cluster.id,
        "name": cluster.name,
        "description": cluster.description,
        "config": cluster_config(cluster),
        "status": rec["status"],
        "current_servers": cluster.current_servers,
        "recommended_servers": rec["recommended_now"],
        "peak_required_servers": rec["peak_required"],
        "latest": latest,
        "sparkline": sparkline,
        "weekly_cost": rec["cost"],
        "upcoming_actions": rec["actions"][:3],
    }


def usage_points(session: Session, cluster_id: str, metric: str, now: pd.Timestamp, hours: int) -> list[dict]:
    series = load_series(session, cluster_id, metric, start=now - pd.Timedelta(hours=hours - 1), end=now)
    return [{"ts": ts.isoformat(), "value": float(v)} for ts, v in series.items()]


def history_vs_predicted(
    session: Session, cluster_id: str, metric: str, now: pd.Timestamp, hours: int
) -> dict:
    start = now - pd.Timedelta(hours=hours - 1)
    actual = load_series(session, cluster_id, metric, start=start, end=now)
    rows = session.execute(
        select(Forecast.target_ts, Forecast.horizon, Forecast.p10, Forecast.p50, Forecast.p90)
        .where(
            Forecast.cluster_id == cluster_id,
            Forecast.metric == metric,
            Forecast.target_ts >= to_naive_utc(start),
            Forecast.target_ts <= to_naive_utc(now),
        )
        .order_by(Forecast.id)
    ).all()
    preds = pd.DataFrame(rows, columns=["target_ts", "horizon", "p10", "p50", "p90"])
    preds["target_ts"] = pd.to_datetime(preds["target_ts"], utc=True)
    # If a retrain produced duplicates, the most recent row wins.
    preds = preds.drop_duplicates(["target_ts", "horizon"], keep="last").set_index(["horizon", "target_ts"])

    def pick(h: int, col: str) -> pd.Series:
        if h in preds.index.get_level_values("horizon"):
            return preds.xs(h, level="horizon")[col].reindex(actual.index)
        return pd.Series(np.nan, index=actual.index)

    df = pd.DataFrame(
        {
            "actual": actual,
            "pred_1h": pick(1, "p50"),
            "pred_24h": pick(24, "p50"),
            "p10_24h": pick(24, "p10"),
            "p90_24h": pick(24, "p90"),
        }
    )

    def mae(col: str) -> float | None:
        valid = df[["actual", col]].dropna()
        return round(float((valid["actual"] - valid[col]).abs().mean()), 2) if len(valid) else None

    points = [
        {"ts": ts.isoformat(), **{k: (None if pd.isna(v) else round(float(v), 2)) for k, v in row.items()}}
        for ts, row in df.iterrows()
    ]
    return {"cluster_id": cluster_id, "metric": metric, "points": points, "mae_1h": mae("pred_1h"), "mae_24h": mae("pred_24h")}


def model_metrics(session: Session) -> list[dict]:
    runs = session.scalars(select(ModelRun).order_by(ModelRun.trained_at)).all()
    latest: dict[tuple[str, str, str], ModelRun] = {}
    for r in runs:
        latest[(r.cluster_id, r.metric, r.model_name)] = r
    production = forecast_service.production_models()
    return [
        {
            "model_name": r.model_name,
            "cluster_id": r.cluster_id,
            "metric": r.metric,
            "mae": round(r.mae, 3),
            "rmse": round(r.rmse, 3),
            "smape": round(r.smape, 3),
            "coverage_80": round(r.coverage_80, 3),
            "trained_at": to_utc(r.trained_at).isoformat(),
            "train_end": to_utc(r.train_end).isoformat(),
            "is_production": production.get((r.cluster_id, r.metric)) == r.model_name,
        }
        for r in sorted(latest.values(), key=lambda r: (r.cluster_id, METRICS.index(r.metric), r.model_name))
    ]


def delete_forecasts_after(session: Session, ts: pd.Timestamp) -> None:
    session.execute(delete(Forecast).where(Forecast.origin_ts > to_naive_utc(ts)))
