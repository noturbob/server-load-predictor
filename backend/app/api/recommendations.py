import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.api.deps import get_cluster, get_session, require_models, sim_now
from app.models import Cluster
from app.services import recommendation

router = APIRouter(tags=["recommendations"], dependencies=[Depends(require_models)])


@router.get("/clusters/{cluster_id}/recommendations", response_model=schemas.RecommendationResponse)
def get_recommendations(
    horizon: int = Query(168, ge=6, le=168),
    cluster: Cluster = Depends(get_cluster),
    session: Session = Depends(get_session),
    now: pd.Timestamp = Depends(sim_now),
):
    return recommendation(session, cluster, now, horizon)
