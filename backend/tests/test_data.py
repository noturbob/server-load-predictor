import pandas as pd

from app.config import settings
from app.data import synthetic
from app.data.store import get_meta_ts, load_usage
from app.db import session_scope
from app.models import Cluster

EXPECTED_ROWS = settings.dataset_days * 24


def test_generator_is_deterministic():
    a = synthetic.generate(settings.dataset_start, 14, seed=7)
    b = synthetic.generate(settings.dataset_start, 14, seed=7)
    for cid in a:
        pd.testing.assert_frame_equal(a[cid], b[cid])


def test_seeded_clusters_and_row_counts(seeded_db):
    with session_scope() as session:
        clusters = session.query(Cluster).all()
        assert {c.id for c in clusters} == {s.id for s in synthetic.CLUSTER_SPECS}
        for c in clusters:
            df = load_usage(session, c.id)
            assert len(df) == EXPECTED_ROWS


def test_no_gaps_and_no_negative_values(seeded_db):
    with session_scope() as session:
        for spec in synthetic.CLUSTER_SPECS:
            df = load_usage(session, spec.id)
            diffs = df.index.to_series().diff().dropna()
            assert (diffs == pd.Timedelta(hours=1)).all()
            assert (df[["cpu", "memory", "network"]] >= 0).all().all()
            assert df.notna().all().all()


def test_sim_start_metadata(seeded_db):
    with session_scope() as session:
        sim_start = get_meta_ts(session, "sim_start")
        dataset_start = get_meta_ts(session, "dataset_start")
    assert sim_start - dataset_start == pd.Timedelta(days=settings.sim_start_day)
