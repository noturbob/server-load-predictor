"""Read/write helpers between the database and pandas."""

from datetime import datetime

import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Cluster, Forecast, Meta, ModelRun, Usage


def to_naive_utc(ts: pd.Timestamp | datetime) -> datetime:
    ts = pd.Timestamp(ts)
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)
    return ts.to_pydatetime()


def to_utc(ts: datetime | pd.Timestamp) -> pd.Timestamp:
    ts = pd.Timestamp(ts)
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")


# --- meta -------------------------------------------------------------------


def get_meta(session: Session, key: str, default: str | None = None) -> str | None:
    row = session.get(Meta, key)
    return row.value if row else default


def set_meta(session: Session, key: str, value: str) -> None:
    row = session.get(Meta, key)
    if row:
        row.value = value
    else:
        session.add(Meta(key=key, value=value))


def get_meta_ts(session: Session, key: str) -> pd.Timestamp | None:
    value = get_meta(session, key)
    return pd.Timestamp(value) if value else None


# --- usage ------------------------------------------------------------------


def load_usage(
    session: Session,
    cluster_id: str,
    start: pd.Timestamp | None = None,
    end: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Usage for one cluster, inclusive of `start` and `end`, indexed by UTC timestamp."""
    stmt = select(Usage.ts, Usage.cpu, Usage.memory, Usage.network).where(
        Usage.cluster_id == cluster_id
    )
    if start is not None:
        stmt = stmt.where(Usage.ts >= to_naive_utc(start))
    if end is not None:
        stmt = stmt.where(Usage.ts <= to_naive_utc(end))
    rows = session.execute(stmt.order_by(Usage.ts)).all()
    df = pd.DataFrame(rows, columns=["ts", "cpu", "memory", "network"])
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    return df.set_index("ts")


def load_series(
    session: Session,
    cluster_id: str,
    metric: str,
    start: pd.Timestamp | None = None,
    end: pd.Timestamp | None = None,
) -> pd.Series:
    series = load_usage(session, cluster_id, start, end)[metric].astype(float)
    if len(series):
        series = series.asfreq("h").interpolate(limit_direction="both")
    series.name = metric
    return series


def replace_dataset(
    session: Session,
    frames: dict[str, pd.DataFrame],
    specs: list,
    source: str,
    sim_start: pd.Timestamp,
) -> None:
    """Wipe everything and load a new dataset."""
    for table in (Forecast, ModelRun, Usage, Cluster, Meta):
        session.execute(delete(table))

    for spec in specs:
        session.add(
            Cluster(
                id=spec.id,
                name=spec.name,
                description=spec.description,
                current_servers=spec.current_servers,
                **spec.config,
            )
        )
    session.flush()

    for cluster_id, df in frames.items():
        records = [
            {
                "cluster_id": cluster_id,
                "ts": to_naive_utc(ts),
                "cpu": float(row.cpu),
                "memory": float(row.memory),
                "network": float(row.network),
            }
            for ts, row in zip(df.index, df.itertuples(index=False))
        ]
        session.execute(Usage.__table__.insert(), records)

    first = min(df.index.min() for df in frames.values())
    last = max(df.index.max() for df in frames.values())
    set_meta(session, "source", source)
    set_meta(session, "dataset_start", first.isoformat())
    set_meta(session, "dataset_end", last.isoformat())
    set_meta(session, "sim_start", to_utc(sim_start).isoformat())
    set_meta(session, "sim_now", to_utc(sim_start).isoformat())
