"""Background retraining jobs (in-process; one at a time)."""

import logging
import threading
import uuid
from datetime import UTC, datetime

from app.ml.train import train_all

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


class RetrainManager:
    def __init__(self) -> None:
        self.jobs: dict[str, dict] = {}
        self._lock = threading.Lock()

    def active(self) -> dict | None:
        return next((j for j in self.jobs.values() if j["status"] in ("queued", "running")), None)

    def start(self, clock, forecast_service) -> dict:
        with self._lock:
            if (job := self.active()) is not None:
                return job
            job = {
                "id": uuid.uuid4().hex[:12],
                "status": "queued",
                "started_at": _now(),
                "finished_at": None,
                "message": "Queued",
                "error": None,
            }
            self.jobs[job["id"]] = job

        def run() -> None:
            job["status"] = "running"
            try:
                train_all(train_end=clock.now, progress=lambda msg: job.update(message=msg))
                forecast_service.reload()
                job.update(status="done", message=f"Retrained on data up to {clock.now.isoformat()}")
            except Exception as exc:  # report failure to the client
                log.exception("Retrain failed")
                job.update(status="failed", error=str(exc), message="Retrain failed")
            finally:
                job["finished_at"] = _now()

        threading.Thread(target=run, name=f"retrain-{job['id']}", daemon=True).start()
        return job


retrain_manager = RetrainManager()
