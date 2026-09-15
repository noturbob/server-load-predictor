from fastapi import APIRouter, Depends, Query

from app import schemas
from app.api.deps import require_models, sim_now
from app.ml.jobs import retrain_manager
from app.services import forecast_service
from app.simulation.clock import clock

router = APIRouter(prefix="/simulation", tags=["simulation"], dependencies=[Depends(sim_now)])


@router.get("", response_model=schemas.SimulationState)
def state():
    return clock.state()


@router.post("/play", response_model=schemas.SimulationState, dependencies=[Depends(require_models)])
def play():
    return clock.set_running(True)


@router.post("/pause", response_model=schemas.SimulationState)
def pause():
    return clock.set_running(False)


@router.post("/step", response_model=schemas.SimulationState, dependencies=[Depends(require_models)])
def step(hours: int = Query(1, ge=1, le=168)):
    return clock.step(hours)


@router.post("/reset", response_model=schemas.SimulationState, dependencies=[Depends(require_models)])
def reset():
    state = clock.reset()
    # Models retrained mid-simulation have seen hours that are now "in the future" again.
    # Retrain them on data up to the start so the replay stays honest.
    if forecast_service.latest_train_end() > clock.start:
        retrain_manager.start(clock, forecast_service, rebuild_backfill=True)
    return state
