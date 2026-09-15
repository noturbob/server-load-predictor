"""Rolling-origin backtesting and forecast metrics."""

from collections.abc import Callable
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from app.ml.base import Forecaster


@dataclass
class Metrics:
    mae: float
    rmse: float
    smape: float  # percent
    coverage_80: float  # fraction of actuals inside [p10, p90]

    def as_dict(self) -> dict:
        return asdict(self)


def compute_metrics(actual: np.ndarray, p10: np.ndarray, p50: np.ndarray, p90: np.ndarray) -> Metrics:
    actual, p10, p50, p90 = (np.asarray(a, dtype=float) for a in (actual, p10, p50, p90))
    err = actual - p50
    denom = np.abs(actual) + np.abs(p50)
    smape = np.where(denom > 0, 2 * np.abs(err) / np.where(denom > 0, denom, 1), 0.0)
    return Metrics(
        mae=float(np.mean(np.abs(err))),
        rmse=float(np.sqrt(np.mean(err**2))),
        smape=float(np.mean(smape) * 100),
        coverage_80=float(np.mean((actual >= p10) & (actual <= p90))),
    )


def backtest(
    make_model: Callable[[], Forecaster],
    series: pd.Series,
    window_days: int = 21,
    horizon: int = 168,
    origin_every: int = 24,
) -> tuple[Metrics, pd.DataFrame]:
    """Fit on everything before the last `window_days`, then forecast from rolling origins inside
    that window and score against the actuals. Returns metrics and the per-point predictions."""
    n = len(series)
    split = n - window_days * 24
    model = make_model().fit(series.iloc[:split])

    frames = []
    for pos in range(split - 1, n - 1 - horizon + 1, origin_every):
        pred = model.predict(series.iloc[: pos + 1], horizon)
        pred["actual"] = series.reindex(pred.index).to_numpy()
        pred["origin"] = series.index[pos]
        frames.append(pred)
    points = pd.concat(frames).dropna(subset=["actual"])
    metrics = compute_metrics(points["actual"], points["p10"], points["p50"], points["p90"])
    return metrics, points
