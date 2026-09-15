import numpy as np
import pandas as pd
import pytest

from app.config import settings
from app.data import synthetic
from app.ml import registry
from app.ml.backtest import compute_metrics
from app.ml.baselines import HoltWinters, SeasonalNaive
from app.ml.features import MIN_HISTORY, make_inference_set, make_training_set
from app.ml.lgbm import LGBMQuantile


@pytest.fixture(scope="module")
def series() -> pd.Series:
    return synthetic.generate(settings.dataset_start, 42, seed=1)["web-frontend"]["cpu"]


def test_features_never_read_the_future(series):
    """Features built from the full series must equal those built from data truncated at t."""
    horizons = np.arange(1, 169)
    for pos in (MIN_HISTORY, 500, 700, len(series) - 200):
        full_X, _ = make_inference_set(series.iloc[: pos + 1], horizons)
        # Corrupt everything after t: features must not change.
        poisoned = series.copy()
        poisoned.iloc[pos + 1 :] = 1e9
        X_train, _, _ = make_training_set(poisoned, horizons, origin_step=1)
        origin = series.index[pos]
        rows = X_train.xs(origin, level="origin")
        pd.testing.assert_frame_equal(
            rows.reset_index(drop=True),
            full_X.reset_index(drop=True).iloc[: len(rows)],
        )


def test_training_targets_align(series):
    X, y_ratio, level = make_training_set(series, np.arange(1, 169), origin_step=24)
    targets = X.index.get_level_values("target")
    np.testing.assert_allclose(y_ratio * level, series.reindex(targets).to_numpy())


@pytest.mark.parametrize(
    "model",
    [SeasonalNaive(), HoltWinters(), LGBMQuantile(n_estimators=20, origin_step=24, min_child_samples=50)],
    ids=lambda m: m.name,
)
def test_models_predict_ordered_quantiles(series, model):
    model.fit(series)
    pred = model.predict(series, 168)
    assert len(pred) == 168
    assert pred.index[0] == series.index[-1] + pd.Timedelta(hours=1)
    assert (pred["p10"] <= pred["p50"]).all() and (pred["p50"] <= pred["p90"]).all()
    assert (pred >= 0).all().all()

    subset = model.predict(series, [1, 24])
    np.testing.assert_allclose(subset["p50"].to_numpy(), pred["p50"].iloc[[0, 23]].to_numpy())


def test_compute_metrics():
    actual = np.array([10.0, 20.0, 30.0])
    m = compute_metrics(actual, actual - 1, actual + np.array([1, -2, 0]), actual + 1)
    assert m.mae == pytest.approx(1.0)
    assert m.rmse == pytest.approx(np.sqrt(5 / 3))
    assert m.coverage_80 == pytest.approx(1.0)


def test_registry_roundtrip(series, tmp_path):
    model = SeasonalNaive().fit(series)
    entry = registry.SeriesModels(
        cluster_id="c1",
        metric="cpu",
        best_model=model.name,
        trained_at="2025-01-01T00:00:00+00:00",
        train_end="2025-01-01T00:00:00+00:00",
        metrics={model.name: {"mae": 1.0}},
        models={model.name: model},
    )
    registry.save(entry, tmp_path)
    loaded = registry.load_all(tmp_path)[("c1", "cpu")]
    pd.testing.assert_frame_equal(loaded.get().predict(series, 24), model.predict(series, 24))
