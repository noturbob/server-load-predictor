"""Simulation clock.

The dataset contains the "future" too. The clock decides how much of it has happened: every tick
moves "now" forward one hour, records the forecasts the production model made at that moment and
lets the dashboard compare them against what actually happened next.
"""

import asyncio
import logging
import threading

import pandas as pd
from sqlalchemy import func, select

from app.config import settings
from app.data.store import get_meta_ts, set_meta, to_naive_utc
from app.db import session_scope
from app.models import Forecast
from app.services import delete_forecasts_after, forecast_service

log = logging.getLogger(__name__)
BACKFILL_HOURS = 72


class SimulationClock:
    def __init__(self) -> None:
        self.start: pd.Timestamp | None = None
        self.end: pd.Timestamp | None = None
        self.now: pd.Timestamp | None = None
        self.running = False
        self.tick_seconds = settings.sim_tick_seconds
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self.now is not None

    def load(self) -> None:
        with session_scope() as session:
            self.start = get_meta_ts(session, "sim_start")
            self.end = get_meta_ts(session, "dataset_end")
            self.now = get_meta_ts(session, "sim_now") or self.start

    def state(self) -> dict:
        total = (self.end - self.start).total_seconds() if self.ready else 0
        done = (self.now - self.start).total_seconds() if self.ready else 0
        return {
            "now": self.now.isoformat(),
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "running": self.running,
            "tick_seconds": self.tick_seconds,
            "progress": round(done / total, 4) if total else 0.0,
        }

    def ensure_backfill(self) -> None:
        """Make sure forecasts exist for the hours leading up to "now" so charts aren't empty."""
        if not self.ready or not forecast_service.loaded:
            return
        first = self.now - pd.Timedelta(hours=BACKFILL_HOURS + 24)
        with session_scope() as session:
            have = session.scalar(
                select(func.count(Forecast.id)).where(
                    Forecast.origin_ts >= to_naive_utc(first), Forecast.origin_ts <= to_naive_utc(self.now)
                )
            )
            expected = (BACKFILL_HOURS + 25) * forecast_service.loaded * 2
            if have < expected:
                origins = pd.date_range(first, self.now, freq="h")
                n = forecast_service.persist(session, origins)
                log.info("Backfilled %s forecasts", n)

    def step(self, hours: int = 1) -> dict:
        with self._lock:
            if not self.ready:
                raise RuntimeError("Simulation not initialised (database empty?)")
            target = min(self.now + pd.Timedelta(hours=hours), self.end)
            if target > self.now:
                origins = pd.date_range(self.now + pd.Timedelta(hours=1), target, freq="h")
                with session_scope() as session:
                    forecast_service.persist(session, origins)
                    set_meta(session, "sim_now", target.isoformat())
                self.now = target
            if self.now >= self.end:
                self.running = False
            return self.state()

    def reset(self) -> dict:
        with self._lock:
            self.running = False
            with session_scope() as session:
                delete_forecasts_after(session, self.start)
                set_meta(session, "sim_now", self.start.isoformat())
            self.now = self.start
        self.ensure_backfill()
        return self.state()

    def set_running(self, running: bool) -> dict:
        self.running = running and self.ready and self.now < self.end
        return self.state()

    async def run(self) -> None:
        while True:
            await asyncio.sleep(self.tick_seconds)
            if self.running:
                try:
                    await asyncio.to_thread(self.step, 1)
                except Exception:  # keep the clock alive; surface the error in logs
                    log.exception("Simulation tick failed")


clock = SimulationClock()
