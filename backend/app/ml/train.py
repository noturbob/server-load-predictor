"""Train and evaluate every model for every cluster x metric.

    uv run python -m app.ml.train                # train on data up to the simulation start
    uv run python -m app.ml.train --until now    # train on data up to the current simulation time
"""

import argparse
import functools
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime

import pandas as pd
from sqlalchemy import select

from app.config import settings
from app.data.store import get_meta_ts, load_series, to_naive_utc
from app.db import init_db, session_scope
from app.ml import registry
from app.ml.backtest import backtest
from app.ml.baselines import HoltWinters, SeasonalNaive
from app.ml.lgbm import LGBMQuantile
from app.models import METRICS, Cluster, ModelRun

log = logging.getLogger(__name__)


def model_factories(fast: bool) -> dict[str, Callable]:
    if fast:
        lgbm = functools.partial(
            LGBMQuantile, n_estimators=40, origin_step=24, min_child_samples=200, calibration_hours=7 * 24
        )
    else:
        lgbm = LGBMQuantile
    return {SeasonalNaive.name: SeasonalNaive, HoltWinters.name: HoltWinters, LGBMQuantile.name: lgbm}


def train_all(
    train_end: pd.Timestamp | None = None,
    fast: bool | None = None,
    progress: Callable[[str], None] | None = None,
) -> list[dict]:
    fast = settings.train_fast if fast is None else fast
    init_db()
    with session_scope() as session:
        train_end = train_end or get_meta_ts(session, "sim_start")
        if train_end is None:
            raise RuntimeError("Database is empty. Run `python -m app.data.seed` first.")
        cluster_ids = session.scalars(select(Cluster.id).order_by(Cluster.id)).all()
        series_map = {
            (cid, metric): load_series(session, cid, metric, end=train_end)
            for cid in cluster_ids
            for metric in METRICS
        }

    factories = model_factories(fast)
    trained_at = datetime.now(UTC).replace(microsecond=0)
    backtest_kwargs = {"window_days": 21, "origin_every": 72 if fast else 24}
    results: list[dict] = []

    for (cid, metric), series in series_map.items():
        if progress:
            progress(f"Training {cid}/{metric}")
        metrics: dict[str, dict] = {}
        fitted = {}
        for name, factory in factories.items():
            t0 = time.perf_counter()
            m, _ = backtest(factory, series, **backtest_kwargs)
            fitted[name] = factory().fit(series)
            metrics[name] = m.as_dict()
            results.append(
                {
                    "cluster_id": cid,
                    "metric": metric,
                    "model_name": name,
                    **m.as_dict(),
                    "seconds": time.perf_counter() - t0,
                    "params": fitted[name].params,
                }
            )
        best = min(metrics, key=lambda k: metrics[k]["mae"])
        registry.save(
            registry.SeriesModels(
                cluster_id=cid,
                metric=metric,
                best_model=best,
                trained_at=trained_at.isoformat(),
                train_end=pd.Timestamp(train_end).isoformat(),
                metrics=metrics,
                models=fitted,
            )
        )

    with session_scope() as session:
        for r in results:
            session.add(
                ModelRun(
                    model_name=r["model_name"],
                    cluster_id=r["cluster_id"],
                    metric=r["metric"],
                    trained_at=to_naive_utc(trained_at),
                    train_end=to_naive_utc(train_end),
                    mae=r["mae"],
                    rmse=r["rmse"],
                    smape=r["smape"],
                    coverage_80=r["coverage_80"],
                    params=r["params"],
                )
            )
    return results


def format_table(results: list[dict]) -> str:
    df = pd.DataFrame(results)
    df["best"] = df.groupby(["cluster_id", "metric"])["mae"].transform("min") == df["mae"]
    df["best"] = df["best"].map({True: "*", False: ""})
    cols = ["cluster_id", "metric", "model_name", "mae", "rmse", "smape", "coverage_80", "seconds", "best"]
    return df[cols].to_string(index=False, float_format=lambda v: f"{v:.2f}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--until", choices=["sim_start", "now"], default="sim_start")
    parser.add_argument("--fast", action="store_true", help="Quick, lower-quality training")
    args = parser.parse_args()

    train_end = None
    if args.until == "now":
        with session_scope() as session:
            train_end = get_meta_ts(session, "sim_now")

    t0 = time.perf_counter()
    results = train_all(train_end, fast=args.fast or None, progress=log.info)
    print("\nBacktest results (rolling origin, last 21 days of training data, 1-168h ahead):\n")
    print(format_table(results))
    print(f"\n* = production model (lowest MAE). Finished in {time.perf_counter() - t0:.0f}s.")


if __name__ == "__main__":
    main()
