from fastapi import APIRouter, Depends, Query

from app import schemas
from app.api.deps import require_models, sim_now
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
    return clock.reset()
