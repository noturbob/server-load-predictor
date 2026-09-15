"""Seed the database.

    uv run python -m app.data.seed --source synthetic
    uv run python -m app.data.seed --source alibaba [--path data/raw/machine_usage.csv]
"""

import argparse
import logging
import shutil
from pathlib import Path

import pandas as pd

from app.config import settings
from app.data import alibaba, synthetic
from app.data.store import replace_dataset
from app.db import init_db, session_scope

log = logging.getLogger(__name__)


def seed(source: str = "synthetic", path: str | None = None) -> None:
    init_db()
    if source == "synthetic":
        frames = synthetic.generate(settings.dataset_start, settings.dataset_days, settings.random_seed)
        sim_start = pd.Timestamp(settings.dataset_start) + pd.Timedelta(days=settings.sim_start_day)
    elif source == "alibaba":
        csv = Path(path) if path else settings.raw_data_dir / "machine_usage.csv"
        frames = alibaba.load(csv)
        last = max(df.index.max() for df in frames.values())
        first = min(df.index.min() for df in frames.values())
        # Keep the final 25% of the trace for the simulation.
        sim_start = (first + (last - first) * 0.75).floor("h")
    else:
        raise ValueError(f"Unknown source: {source}")

    with session_scope() as session:
        replace_dataset(session, frames, synthetic.CLUSTER_SPECS, source, sim_start)

    # Models trained on a previous dataset are no longer valid.
    shutil.rmtree(settings.artifacts_dir, ignore_errors=True)

    rows = sum(len(df) for df in frames.values())
    log.info("Seeded %s clusters, %s usage rows from %s (sim starts %s)", len(frames), rows, source, sim_start)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--source", choices=["synthetic", "alibaba"], default="synthetic")
    parser.add_argument("--path", help="Path to machine_usage.csv (alibaba only)")
    args = parser.parse_args()
    seed(args.source, args.path)


if __name__ == "__main__":
    main()
