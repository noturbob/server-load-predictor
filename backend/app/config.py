from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SLP_", env_file=".env", extra="ignore")

    database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'app.db'}"
    artifacts_dir: Path = BACKEND_DIR / "artifacts"
    raw_data_dir: Path = BACKEND_DIR / "data" / "raw"

    # Synthetic dataset: total days, and the day the simulation (and "production") starts.
    dataset_days: int = 120
    sim_start_day: int = 90
    dataset_start: str = "2025-08-01T00:00:00Z"
    random_seed: int = 42

    # Simulation clock
    sim_tick_seconds: float = 5.0
    sim_autostart: bool = False

    # Forecasting
    forecast_horizon: int = 168
    train_fast: bool = False  # fewer trees / sparser origins (used by tests)

    # Startup behaviour
    auto_seed: bool = True
    auto_train: bool = True
    start_simulation: bool = True

    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


settings = Settings()
