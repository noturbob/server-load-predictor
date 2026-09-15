import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import schemas
from app.api.deps import get_cluster, get_session, require_models, sim_now
from app.models import Cluster
from app.services import forecast_service, history_vs_predicted

router = APIRouter(prefix="/clusters/{cluster_id}", tags=["forecast"], dependencies=[Depends(require_models)])


@router.get("/forecast", response_model=schemas.ForecastResponse)
def get_forecast(
    metric: schemas.Metric = "cpu",
    horizon: int = Query(168, ge=1, le=168),
    model: str = "best",
    cluster: Cluster = Depends(get_cluster),
    session: Session = Depends(get_session),
    now: pd.Timestamp = Depends(sim_now),
):
    try:
        name, pred = forecast_service.forecast(session, cluster.id, metric, now, horizon, model)
    except KeyError as exc:
        raise HTTPException(400, str(exc.args[0])) from exc
    return {
        "cluster_id": cluster.id,
        "metric": metric,
        "model": name,
        "origin": now.isoformat(),
        "points": [
            {"ts": ts.isoformat(), "p10": round(r.p10, 2), "p50": round(r.p50, 2), "p90": round(r.p90, 2)}
            for ts, r in pred.iterrows()
        ],
    }


@router.get("/history-vs-predicted", response_model=schemas.HistoryVsPredictedResponse)
def get_history_vs_predicted(
    metric: schemas.Metric = "cpu",
    hours: int = Query(72, ge=1, le=24 * 30),
    cluster: Cluster = Depends(get_cluster),
    session: Session = Depends(get_session),
    now: pd.Timestamp = Depends(sim_now),
):
    return history_vs_predicted(session, cluster.id, metric, now, hours)
