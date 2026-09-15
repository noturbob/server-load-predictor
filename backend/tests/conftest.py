import os
import tempfile
from pathlib import Path

# Configure an isolated database/artifacts dir and fast training *before* the app is imported.
_TMP = Path(tempfile.mkdtemp(prefix="slp-tests-"))
os.environ["SLP_DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["SLP_ARTIFACTS_DIR"] = str(_TMP / "artifacts")
os.environ["SLP_TRAIN_FAST"] = "true"
os.environ["SLP_START_SIMULATION"] = "false"

import pytest


@pytest.fixture(scope="session")
def seeded_db():
    from app.data.seed import seed

    seed("synthetic")
    return True
