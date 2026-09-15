"""Common forecaster interface.

    model.fit(series)                       # hourly pd.Series with a UTC DatetimeIndex
    model.predict(history, horizon)         # forecast from history.index[-1]
        -> DataFrame[target_ts index, p10, p50, p90]

`predict` takes the history rather than an origin timestamp so a fitted model can keep
forecasting as new observations arrive (the simulation clock) without refitting.
"""

from abc import ABC, abstractmethod

import numpy as np
import pandas as pd

QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}


class Forecaster(ABC):
    name: str = "base"

    @abstractmethod
    def fit(self, series: pd.Series) -> "Forecaster": ...

    @abstractmethod
    def predict(self, history: pd.Series, horizon: int | list[int] = 168) -> pd.DataFrame: ...

    @property
    def params(self) -> dict:
        return {}


def horizons_array(horizon: int | list[int]) -> np.ndarray:
    if isinstance(horizon, int):
        return np.arange(1, horizon + 1)
    return np.asarray(sorted(horizon), dtype=int)


def finalize(target_ts: pd.DatetimeIndex, p10, p50, p90) -> pd.DataFrame:
    """Enforce 0 <= p10 <= p50 <= p90 and return the standard frame."""
    q = np.sort(np.column_stack([p10, p50, p90]), axis=1)
    q = np.clip(q, 0.0, None)
    return pd.DataFrame(q, columns=["p10", "p50", "p90"], index=pd.DatetimeIndex(target_ts, name="target_ts"))


def target_index(history: pd.Series, horizons: np.ndarray) -> pd.DatetimeIndex:
    return history.index[-1] + pd.to_timedelta(horizons, unit="h")
