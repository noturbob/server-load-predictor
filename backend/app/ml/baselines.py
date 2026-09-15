"""Simple baselines the ML model has to beat."""

import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

from app.ml.base import Forecaster, finalize, horizons_array, target_index


class SeasonalNaive(Forecaster):
    """Tomorrow looks like the same hour last week: y[t+h] = y[t+h-168]."""

    name = "seasonal_naive"
    season = 168

    def fit(self, series: pd.Series) -> "SeasonalNaive":
        y = series.to_numpy(dtype=float)
        resid = y[self.season :] - y[: -self.season]
        self.q10_, self.q90_ = np.quantile(resid, [0.1, 0.9])
        return self

    def predict(self, history: pd.Series, horizon: int | list[int] = 168) -> pd.DataFrame:
        H = horizons_array(horizon)
        y = history.to_numpy(dtype=float)
        n = len(y)
        idx = n - 1 + H - self.season * np.ceil(H / self.season).astype(int)
        p50 = y[idx]
        return finalize(target_index(history, H), p50 + self.q10_, p50, p50 + self.q90_)

    @property
    def params(self) -> dict:
        return {"season": self.season}


class HoltWinters(Forecaster):
    """Additive Holt-Winters with a damped trend and daily seasonality, refit at each origin."""

    name = "holt_winters"
    season = 24
    window_hours = 28 * 24

    def fit(self, series: pd.Series) -> "HoltWinters":
        fitted = self._fit(series.iloc[-self.window_hours :])
        resid = series.iloc[-self.window_hours :].to_numpy() - np.asarray(fitted.fittedvalues)
        self.q10_, self.q90_ = np.quantile(resid, [0.1, 0.9])
        return self

    def _fit(self, series: pd.Series):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return ExponentialSmoothing(
                series.to_numpy(dtype=float),
                trend="add",
                damped_trend=True,
                seasonal="add",
                seasonal_periods=self.season,
                initialization_method="estimated",
            ).fit(optimized=True)

    def predict(self, history: pd.Series, horizon: int | list[int] = 168) -> pd.DataFrame:
        H = horizons_array(horizon)
        fitted = self._fit(history.iloc[-self.window_hours :])
        path = np.asarray(fitted.forecast(int(H.max())))
        p50 = path[H - 1]
        # One-step residual spread, widened as uncertainty grows with the horizon.
        widen = np.sqrt(1 + (H - 1) / 24)
        return finalize(target_index(history, H), p50 + self.q10_ * widen, p50, p50 + self.q90_ * widen)

    @property
    def params(self) -> dict:
        return {"season": self.season, "window_hours": self.window_hours, "damped_trend": True}
