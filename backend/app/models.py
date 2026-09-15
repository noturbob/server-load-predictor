"""ORM tables. All timestamps are stored as naive UTC datetimes."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

METRICS = ("cpu", "memory", "network")


class Cluster(Base):
    __tablename__ = "clusters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(String(512), default="")

    # Capacity & scaling policy
    server_capacity: Mapped[float] = mapped_column(Float, default=100.0)  # CPU load units/server
    server_memory_gb: Mapped[float] = mapped_column(Float, default=64.0)
    target_utilization: Mapped[float] = mapped_column(Float, default=0.70)
    min_servers: Mapped[int] = mapped_column(Integer, default=2)
    max_servers: Mapped[int] = mapped_column(Integer, default=50)
    cost_per_server_hour: Mapped[float] = mapped_column(Float, default=0.48)
    lead_time_hours: Mapped[int] = mapped_column(Integer, default=1)
    scale_down_window: Mapped[int] = mapped_column(Integer, default=6)
    current_servers: Mapped[int] = mapped_column(Integer, default=10)


class Usage(Base):
    __tablename__ = "usage"
    __table_args__ = (UniqueConstraint("cluster_id", "ts", name="uq_usage_cluster_ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cluster_id: Mapped[str] = mapped_column(ForeignKey("clusters.id", ondelete="CASCADE"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    cpu: Mapped[float] = mapped_column(Float)  # total CPU load units across the cluster
    memory: Mapped[float] = mapped_column(Float)  # GB in use across the cluster
    network: Mapped[float] = mapped_column(Float)  # Mbps


class Forecast(Base):
    """Forecasts as they were made at `origin_ts` (only selected horizons are persisted)."""

    __tablename__ = "forecasts"
    __table_args__ = (
        UniqueConstraint(
            "cluster_id", "metric", "model_name", "origin_ts", "horizon", name="uq_forecast"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cluster_id: Mapped[str] = mapped_column(String(64), index=True)
    metric: Mapped[str] = mapped_column(String(16))
    model_name: Mapped[str] = mapped_column(String(32))
    origin_ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    horizon: Mapped[int] = mapped_column(Integer)
    target_ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    p10: Mapped[float] = mapped_column(Float)
    p50: Mapped[float] = mapped_column(Float)
    p90: Mapped[float] = mapped_column(Float)


class ModelRun(Base):
    __tablename__ = "model_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_name: Mapped[str] = mapped_column(String(32))
    cluster_id: Mapped[str] = mapped_column(String(64), index=True)
    metric: Mapped[str] = mapped_column(String(16))
    trained_at: Mapped[datetime] = mapped_column(DateTime)
    train_end: Mapped[datetime] = mapped_column(DateTime)
    mae: Mapped[float] = mapped_column(Float)
    rmse: Mapped[float] = mapped_column(Float)
    smape: Mapped[float] = mapped_column(Float)
    coverage_80: Mapped[float] = mapped_column(Float)
    params: Mapped[dict] = mapped_column(JSON, default=dict)


class Meta(Base):
    """Key/value store for dataset & simulation metadata."""

    __tablename__ = "meta"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(256))
