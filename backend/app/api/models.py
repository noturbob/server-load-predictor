from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.api.deps import get_session, sim_now
from app.ml.jobs import retrain_manager
from app.services import forecast_service, model_metrics
from app.simulation.clock import clock

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/metrics", response_model=list[schemas.ModelMetric])
def get_metrics(session: Session = Depends(get_session)):
    return model_metrics(session)


@router.post("/retrain", response_model=schemas.RetrainJob, status_code=202, dependencies=[Depends(sim_now)])
def retrain():
    return retrain_manager.start(clock, forecast_service)


@router.get("/retrain/{job_id}", response_model=schemas.RetrainJob)
def retrain_status(job_id: str):
    job = retrain_manager.jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job
