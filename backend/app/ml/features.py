"""Feature engineering for the direct multi-horizon forecaster.

One training row = (origin time t, horizon h). The target is y[t+h]. Every feature is computed
from values at or before t (plus the calendar of the target time, which is known in advance),
so the same code path is used for training and for live inference without leaking the future.

Values are expressed relative to `level` = mean of the last 168 hours at t. That makes the model
scale-free, so it copes with growth trends that tree models can't extrapolate on raw values.
"""

import numpy as np
import pandas as pd

MIN_HISTORY = 336  # two weeks: needed for the `season_336` feature
LAGS = (0, 1, 2, 3, 6, 12, 24, 48, 168)

FEATURE_COLUMNS = [
    *(f"lag_{k}" for k in LAGS),
    "roll_mean_24",
    "roll_std_24",
    "roll_max_24",
    "roll_min_24",
    "week_growth",
    "season_24",
    "season_168",
    "season_336",
    "season_24_mean7",
    "season_168_mean2",
    "h",
    "hour",
    "dayofweek",
    "is_weekend",
    "days_to_month_end",
    "is_month_end",
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
]


class _Rolling:
    """Trailing rolling statistics; value at position i only uses y[..i]."""

    def __init__(self, y: np.ndarray):
        s = pd.Series(y)
        self.mean_24 = s.rolling(24).mean().to_numpy()
        self.std_24 = s.rolling(24).std().to_numpy()
        self.max_24 = s.rolling(24).max().to_numpy()
        self.min_24 = s.rolling(24).min().to_numpy()
        self.mean_168 = s.rolling(168).mean().to_numpy()


def _build(
    y: np.ndarray, origin_ts: pd.DatetimeIndex, positions: np.ndarray, horizons: np.ndarray
) -> tuple[pd.DataFrame, np.ndarray]:
    """Build the feature matrix for every (position, horizon) pair (positions x horizons)."""
    roll = _Rolling(y)
    P = np.repeat(positions, len(horizons))
    H = np.tile(horizons, len(positions))
    origins = np.repeat(origin_ts.to_numpy(), len(horizons))

    level = roll.mean_168[P]
    level = np.where(level > 1e-9, level, 1e-9)

    cols: dict[str, np.ndarray] = {}
    for k in LAGS:
        cols[f"lag_{k}"] = y[P - k] / level
    cols["roll_mean_24"] = roll.mean_24[P] / level
    cols["roll_std_24"] = roll.std_24[P] / level
    cols["roll_max_24"] = roll.max_24[P] / level
    cols["roll_min_24"] = roll.min_24[P] / level
    cols["week_growth"] = level / np.maximum(roll.mean_168[P - 168], 1e-9)

    # Most recent known value at the same hour-of-day / hour-of-week as the target.
    cols["season_24"] = y[P + H - 24 * np.ceil(H / 24).astype(int)] / level
    cols["season_168"] = y[P + H - 168 * np.ceil(H / 168).astype(int)] / level
    cols["season_336"] = y[P + H - 336 * np.ceil(H / 336).astype(int)] / level
    # Denoised profiles: average of the last 7 same-hour values and the last 2 same-hour-of-week.
    base24 = P + H - 24 * np.ceil(H / 24).astype(int)
    cols["season_24_mean7"] = np.mean([y[base24 - 24 * k] for k in range(7)], axis=0) / level
    cols["season_168_mean2"] = (cols["season_168"] + cols["season_336"]) / 2

    target_ts = pd.DatetimeIndex(origins) + pd.to_timedelta(H, unit="h")
    hour = target_ts.hour.to_numpy()
    dow = target_ts.dayofweek.to_numpy()
    cols["h"] = H
    cols["hour"] = hour
    cols["dayofweek"] = dow
    cols["is_weekend"] = (dow >= 5).astype(int)
    # Days until month end, capped: captures month-end jobs without memorising calendar dates.
    cols["days_to_month_end"] = np.minimum(target_ts.days_in_month.to_numpy() - target_ts.day.to_numpy(), 4)
    cols["is_month_end"] = (target_ts.day.to_numpy() >= target_ts.days_in_month.to_numpy() - 1).astype(int)
    cols["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    cols["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    cols["dow_sin"] = np.sin(2 * np.pi * dow / 7)
    cols["dow_cos"] = np.cos(2 * np.pi * dow / 7)

    X = pd.DataFrame(cols, columns=FEATURE_COLUMNS)
    X.index = pd.MultiIndex.from_arrays([pd.DatetimeIndex(origins), target_ts], names=["origin", "target"])
    return X, level


def make_training_set(
    series: pd.Series, horizons: np.ndarray, origin_step: int = 3
) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """Return (X, y_ratio, level) for all origins with a fully observed target."""
    y = series.to_numpy(dtype=float)
    n = len(y)
    positions = np.arange(MIN_HISTORY, n - 1, origin_step)
    if len(positions) == 0:
        raise ValueError(f"Need more than {MIN_HISTORY} hours of history to train, got {n}.")
    X, level = _build(y, series.index[positions], positions, horizons)
    P = np.repeat(positions, len(horizons))
    H = np.tile(horizons, len(positions))
    valid = P + H < n
    target = np.full(len(P), np.nan)
    target[valid] = y[(P + H)[valid]]
    X = X[valid]
    return X, target[valid] / level[valid], level[valid]


def make_inference_set(series: pd.Series, horizons: np.ndarray) -> tuple[pd.DataFrame, np.ndarray]:
    """Features for forecasting from the last timestamp of `series`."""
    y = series.to_numpy(dtype=float)
    if len(y) < MIN_HISTORY + 1:
        raise ValueError(f"Need at least {MIN_HISTORY + 1} hours of history, got {len(y)}.")
    pos = np.array([len(y) - 1])
    return _build(y, series.index[pos], pos, horizons)
