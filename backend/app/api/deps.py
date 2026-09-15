from collections.abc import Iterator

import pandas as pd
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import session_scope
from app.models import Cluster
from app.services import forecast_service
from app.simulation.clock import clock


def get_session() -> Iterator[Session]:
    with session_scope() as session:
        yield session


def sim_now() -> pd.Timestamp:
    if not clock.ready:
        raise HTTPException(503, "Simulation not initialised. Seed the database first.")
    return clock.now


def require_models() -> None:
    if not forecast_service.loaded:
        raise HTTPException(503, "No trained models yet. Run `python -m app.ml.train`.")


def get_cluster(cluster_id: str, session: Session = Depends(get_session)) -> Cluster:
    cluster = session.get(Cluster, cluster_id)
    if cluster is None:
        raise HTTPException(404, f"Cluster '{cluster_id}' not found")
    return cluster
