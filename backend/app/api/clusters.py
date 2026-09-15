import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.api.deps import get_cluster, get_session, require_models, sim_now
from app.models import Cluster
from app.services import cluster_summary, usage_points

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("", response_model=list[schemas.ClusterSummary], dependencies=[Depends(require_models)])
def list_clusters(session: Session = Depends(get_session), now: pd.Timestamp = Depends(sim_now)):
    clusters = session.scalars(select(Cluster).order_by(Cluster.name)).all()
    return [cluster_summary(session, c, now) for c in clusters]


@router.get("/{cluster_id}", response_model=schemas.ClusterSummary, dependencies=[Depends(require_models)])
def get_cluster_detail(
    cluster: Cluster = Depends(get_cluster),
    session: Session = Depends(get_session),
    now: pd.Timestamp = Depends(sim_now),
):
    return cluster_summary(session, cluster, now)


@router.patch("/{cluster_id}/config", response_model=schemas.ClusterConfig)
def update_config(
    update: schemas.ClusterConfigUpdate,
    cluster: Cluster = Depends(get_cluster),
    session: Session = Depends(get_session),
):
    changes = update.model_dump(exclude_unset=True, exclude_none=True)
    min_servers = changes.get("min_servers", cluster.min_servers)
    max_servers = changes.get("max_servers", cluster.max_servers)
    if min_servers > max_servers:
        raise HTTPException(422, "min_servers must be <= max_servers")
    for key, value in changes.items():
        setattr(cluster, key, value)
    session.commit()
    return schemas.ClusterConfig.model_validate(cluster, from_attributes=True)


@router.get("/{cluster_id}/usage", response_model=schemas.UsageResponse)
def get_usage(
    metric: schemas.Metric = "cpu",
    hours: int = Query(168, ge=1, le=24 * 60),
    cluster: Cluster = Depends(get_cluster),
    session: Session = Depends(get_session),
    now: pd.Timestamp = Depends(sim_now),
):
    return {
        "cluster_id": cluster.id,
        "metric": metric,
        "now": now.isoformat(),
        "points": usage_points(session, cluster.id, metric, now, hours),
    }
