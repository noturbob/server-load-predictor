import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app import schemas
from app.api import clusters, forecast, models, recommendations, simulation
from app.config import settings
from app.data.store import get_meta
from app.db import init_db, session_scope
from app.ml import registry
from app.models import Cluster
from app.services import forecast_service
from app.simulation.clock import clock

log = logging.getLogger("app")


def bootstrap() -> None:
    """Seed, train and warm up so the dashboard has data on first launch."""
    init_db()
    with session_scope() as session:
        empty = session.scalar(select(func.count(Cluster.id))) == 0
    if empty and settings.auto_seed:
        from app.data.seed import seed

        log.info("Database empty: seeding synthetic data")
        seed("synthetic")
    if settings.auto_train and not registry.has_artifacts():
        from app.ml.train import train_all

        log.info("No trained models found: training (this takes a minute or two)...")
        train_all(progress=log.info)
    forecast_service.reload()
    clock.load()
    clock.ensure_backfill()


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    await asyncio.to_thread(bootstrap)
    task = None
    if settings.start_simulation and clock.ready:
        clock.running = settings.sim_autostart
        task = asyncio.create_task(clock.run())
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="Server Load Predictor API",
    version="0.1.0",
    description="Forecasts cluster CPU/memory/network load and recommends scaling actions.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (clusters, forecast, recommendations, models, simulation):
    app.include_router(module.router)


@app.get("/health", response_model=schemas.Health, tags=["health"])
def health():
    with session_scope() as session:
        source = get_meta(session, "source")
    return {
        "status": "ok",
        "sim_now": clock.now.isoformat() if clock.ready else None,
        "models_loaded": forecast_service.loaded,
        "data_source": source,
    }
