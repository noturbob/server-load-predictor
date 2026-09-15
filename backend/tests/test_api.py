import time

import pandas as pd
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client(seeded_db):
    from app.main import app

    with TestClient(app) as c:
        yield c


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["models_loaded"] == 9
    assert body["data_source"] == "synthetic"


def test_list_and_get_clusters(client):
    clusters = client.get("/clusters").json()
    assert len(clusters) == 3
    c = clusters[0]
    assert c["status"] in {"healthy", "scale_up_soon", "over_provisioned", "at_risk"}
    assert len(c["sparkline"]) == 48
    assert c["latest"] is not None
    detail = client.get(f"/clusters/{c['id']}").json()
    assert detail["id"] == c["id"]
    assert client.get("/clusters/nope").status_code == 404


def test_usage_never_exceeds_now(client):
    now = pd.Timestamp(client.get("/simulation").json()["now"])
    body = client.get("/clusters/web-frontend/usage", params={"metric": "memory", "hours": 48}).json()
    assert len(body["points"]) == 48
    assert pd.Timestamp(body["points"][-1]["ts"]) == now


def test_forecast(client):
    body = client.get("/clusters/api-gateway/forecast", params={"metric": "cpu", "horizon": 24}).json()
    assert body["model"] in {"lightgbm", "seasonal_naive", "holt_winters"}
    assert len(body["points"]) == 24
    p = body["points"][0]
    assert p["p10"] <= p["p50"] <= p["p90"]
    other = client.get("/clusters/api-gateway/forecast", params={"model": "seasonal_naive", "horizon": 6})
    assert other.json()["model"] == "seasonal_naive"
    assert client.get("/clusters/api-gateway/forecast", params={"model": "bogus"}).status_code == 400


def test_history_vs_predicted_has_backfilled_predictions(client):
    body = client.get("/clusters/batch-jobs/history-vs-predicted", params={"hours": 48}).json()
    assert len(body["points"]) == 48
    assert body["mae_1h"] is not None and body["mae_24h"] is not None
    assert all(p["pred_1h"] is not None for p in body["points"])


def test_recommendations(client):
    body = client.get("/clusters/web-frontend/recommendations", params={"horizon": 48}).json()
    assert len(body["plan"]) == 48
    assert body["cost"]["hours"] == 48
    assert body["recommended_now"] >= 1


def test_config_update_changes_recommendation(client):
    before = client.get("/clusters/web-frontend/recommendations").json()
    r = client.patch("/clusters/web-frontend/config", json={"target_utilization": 0.4})
    assert r.status_code == 200 and r.json()["target_utilization"] == 0.4
    after = client.get("/clusters/web-frontend/recommendations").json()
    assert after["peak_required"] > before["peak_required"]
    assert client.patch("/clusters/web-frontend/config", json={"min_servers": 99, "max_servers": 5}).status_code == 422
    assert client.patch("/clusters/web-frontend/config", json={"target_utilization": 0.7}).status_code == 200


def test_simulation_controls(client):
    start = client.get("/simulation").json()
    stepped = client.post("/simulation/step", params={"hours": 3}).json()
    assert pd.Timestamp(stepped["now"]) - pd.Timestamp(start["now"]) == pd.Timedelta(hours=3)
    latest = client.get("/clusters/web-frontend").json()["latest"]
    assert latest["ts"] == stepped["now"]
    assert client.post("/simulation/play").json()["running"] is True
    assert client.post("/simulation/pause").json()["running"] is False
    reset = client.post("/simulation/reset").json()
    assert reset["now"] == reset["start"]


def test_model_metrics_and_retrain(client):
    metrics = client.get("/models/metrics").json()
    assert len(metrics) == 27
    assert sum(m["is_production"] for m in metrics) == 9

    job = client.post("/models/retrain").json()
    assert job["status"] in {"queued", "running"}
    for _ in range(300):
        job = client.get(f"/models/retrain/{job['id']}").json()
        if job["status"] in {"done", "failed"}:
            break
        time.sleep(0.5)
    assert job["status"] == "done", job
    assert client.get("/models/retrain/missing").status_code == 404


def test_reset_after_midway_retrain_retrains_on_start(client):
    from app.ml.jobs import retrain_manager
    from app.services import forecast_service

    client.post("/simulation/step", params={"hours": 2})
    job = client.post("/models/retrain").json()
    _wait(client, job["id"])
    assert forecast_service.latest_train_end() > pd.Timestamp(client.get("/simulation").json()["start"])

    reset = client.post("/simulation/reset").json()
    active = retrain_manager.active()
    assert active is not None
    assert _wait(client, active["id"])["status"] == "done"
    assert forecast_service.latest_train_end() == pd.Timestamp(reset["start"])


def _wait(client, job_id):
    for _ in range(300):
        job = client.get(f"/models/retrain/{job_id}").json()
        if job["status"] in {"done", "failed"}:
            return job
        time.sleep(0.5)
    raise AssertionError("retrain did not finish")
