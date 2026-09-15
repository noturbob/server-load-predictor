"""Persist and load trained models.

Layout: artifacts/{cluster_id}/{metric}/{model_name}.joblib + metadata.json
"""

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import joblib

from app.config import settings
from app.ml.base import Forecaster
from app.ml.baselines import HoltWinters, SeasonalNaive
from app.ml.lgbm import LGBMQuantile

MODEL_CLASSES: dict[str, type[Forecaster]] = {
    SeasonalNaive.name: SeasonalNaive,
    HoltWinters.name: HoltWinters,
    LGBMQuantile.name: LGBMQuantile,
}


@dataclass
class SeriesModels:
    cluster_id: str
    metric: str
    best_model: str
    trained_at: str
    train_end: str
    metrics: dict[str, dict]
    models: dict[str, Forecaster] = field(default_factory=dict)

    def get(self, name: str | None = None) -> Forecaster:
        key = self.best_model if name in (None, "best") else name
        if key not in self.models:
            raise KeyError(f"Unknown model '{name}'. Available: {sorted(self.models)}")
        return self.models[key]


def _dir(root: Path, cluster_id: str, metric: str) -> Path:
    return root / cluster_id / metric


def save(entry: SeriesModels, root: Path | None = None) -> None:
    root = root or settings.artifacts_dir
    path = _dir(root, entry.cluster_id, entry.metric)
    tmp = path.with_name(path.name + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    for name, model in entry.models.items():
        joblib.dump(model, tmp / f"{name}.joblib")
    meta = {
        "cluster_id": entry.cluster_id,
        "metric": entry.metric,
        "best_model": entry.best_model,
        "trained_at": entry.trained_at,
        "train_end": entry.train_end,
        "metrics": entry.metrics,
    }
    (tmp / "metadata.json").write_text(json.dumps(meta, indent=2))
    shutil.rmtree(path, ignore_errors=True)
    tmp.rename(path)


def load_all(root: Path | None = None) -> dict[tuple[str, str], SeriesModels]:
    root = root or settings.artifacts_dir
    out: dict[tuple[str, str], SeriesModels] = {}
    if not root.exists():
        return out
    for meta_path in root.glob("*/*/metadata.json"):
        meta = json.loads(meta_path.read_text())
        models = {
            p.stem: joblib.load(p) for p in meta_path.parent.glob("*.joblib") if p.stem in MODEL_CLASSES
        }
        entry = SeriesModels(**meta, models=models)
        out[(entry.cluster_id, entry.metric)] = entry
    return out


def has_artifacts(root: Path | None = None) -> bool:
    root = root or settings.artifacts_dir
    return root.exists() and any(root.glob("*/*/metadata.json"))
