"""LightGBM quantile forecaster (p10 / p50 / p90) for horizons 1..168h.

Quantile trees fitted on overlapping multi-horizon rows tend to produce intervals that are too
narrow out of sample, so the p10/p90 band is widened with split-conformal calibration (CQR):
fit on all but the last two weeks, measure how far actuals fall outside the band there, then
refit on the full series and apply that margin per horizon bucket.
"""

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

from app.ml.base import QUANTILES, Forecaster, finalize, horizons_array
from app.ml.features import make_inference_set, make_training_set

HORIZON_BUCKETS = np.array([0, 6, 24, 72, 168])


def _bucket(h: np.ndarray) -> np.ndarray:
    return np.clip(np.searchsorted(HORIZON_BUCKETS, h, side="left") - 1, 0, len(HORIZON_BUCKETS) - 2)


class LGBMQuantile(Forecaster):
    name = "lightgbm"

    def __init__(
        self,
        n_estimators: int = 300,
        learning_rate: float = 0.05,
        num_leaves: int = 15,
        min_child_samples: int = 1000,
        reg_lambda: float = 5.0,
        origin_step: int = 4,
        max_horizon: int = 168,
        calibration_hours: int = 14 * 24,
        coverage: float = 0.8,
    ):
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.num_leaves = num_leaves
        self.min_child_samples = min_child_samples
        self.reg_lambda = reg_lambda
        self.origin_step = origin_step
        self.max_horizon = max_horizon
        self.calibration_hours = calibration_hours
        self.coverage = coverage
        self.models_: dict[str, LGBMRegressor] = {}
        self.margins_ = np.zeros(len(HORIZON_BUCKETS) - 1)

    # -- training ---------------------------------------------------------------

    def _fit_quantiles(self, X: pd.DataFrame, y_ratio: np.ndarray) -> dict[str, LGBMRegressor]:
        models = {}
        for key, alpha in QUANTILES.items():
            model = LGBMRegressor(
                objective="quantile",
                alpha=alpha,
                n_estimators=self.n_estimators,
                learning_rate=self.learning_rate,
                num_leaves=self.num_leaves,
                min_child_samples=self.min_child_samples,
                reg_lambda=self.reg_lambda,
                subsample=0.8,
                subsample_freq=1,
                colsample_bytree=0.9,
                verbose=-1,
            )
            model.fit(X, y_ratio)
            models[key] = model
        return models

    def fit(self, series: pd.Series) -> "LGBMQuantile":
        horizons = np.arange(1, self.max_horizon + 1)
        X, y_ratio, _ = make_training_set(series, horizons, origin_step=self.origin_step)
        origins = X.index.get_level_values("origin")
        targets = X.index.get_level_values("target")

        # 1) Conformal calibration on origins inside the final `calibration_hours`.
        cal_start = series.index[-1] - pd.Timedelta(hours=self.calibration_hours)
        train_mask = np.asarray(targets <= cal_start)
        cal_mask = np.asarray(origins >= cal_start)
        if train_mask.sum() > self.min_child_samples * 4 and cal_mask.sum() > 0:
            models = self._fit_quantiles(X[train_mask], y_ratio[train_mask])
            Xc, yc = X[cal_mask], y_ratio[cal_mask]
            lo, hi = models["p10"].predict(Xc), models["p90"].predict(Xc)
            scores = np.maximum(lo - yc, yc - hi)
            buckets = _bucket(Xc["h"].to_numpy())
            for b in range(len(self.margins_)):
                s = scores[buckets == b]
                if len(s):
                    q = min(1.0, self.coverage * (1 + 1 / len(s)))
                    self.margins_[b] = max(0.0, float(np.quantile(s, q)))

        # 2) Final models on all data.
        self.models_ = self._fit_quantiles(X, y_ratio)
        return self

    # -- inference --------------------------------------------------------------

    def predict(self, history: pd.Series, horizon: int | list[int] = 168) -> pd.DataFrame:
        H = horizons_array(horizon)
        if H.max() > self.max_horizon:
            raise ValueError(f"Max horizon is {self.max_horizon}h")
        X, level = make_inference_set(history, H)
        margin = self.margins_[_bucket(H)]
        p10 = (self.models_["p10"].predict(X) - margin) * level
        p50 = self.models_["p50"].predict(X) * level
        p90 = (self.models_["p90"].predict(X) + margin) * level
        return finalize(X.index.get_level_values("target"), p10, p50, p90)

    @property
    def params(self) -> dict:
        return {
            "n_estimators": self.n_estimators,
            "learning_rate": self.learning_rate,
            "num_leaves": self.num_leaves,
            "min_child_samples": self.min_child_samples,
            "reg_lambda": self.reg_lambda,
            "origin_step": self.origin_step,
            "conformal_margins": [round(float(m), 4) for m in self.margins_],
        }
