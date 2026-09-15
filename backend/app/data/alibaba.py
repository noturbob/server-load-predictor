"""Optional loader for the Alibaba Cluster Trace v2018 (`machine_usage.csv`).

Download: https://github.com/alibaba/clusterdata/tree/master/cluster-trace-v2018
Place (or symlink) the extracted CSV at `backend/data/raw/machine_usage.csv`.

The CSV has no header. Columns:
    machine_id, time_stamp, cpu_util_percent, mem_util_percent, mem_gps,
    mkp, net_in, net_out, disk_io_percent

Machines are bucketed into three pseudo-clusters by a stable hash of machine_id. For each hour we
average every machine's utilisation, then sum across machines, so one fully busy machine equals
100 CPU load units (matching the default `server_capacity`).

Note: the 2018 trace covers only 8 days, which is less than the 3 weeks of history the weekly
forecaster needs. It is useful for exploring real-world patterns; the synthetic dataset is the
default for the full demo.
"""

import zlib
from pathlib import Path

import pandas as pd

from app.data.synthetic import CLUSTER_SPECS

COLUMNS = [
    "machine_id",
    "time_stamp",
    "cpu_util_percent",
    "mem_util_percent",
    "mem_gps",
    "mkp",
    "net_in",
    "net_out",
    "disk_io_percent",
]


def load(
    path: Path,
    start: str = "2025-08-01T00:00:00Z",
    server_memory_gb: float = 64.0,
    chunksize: int = 2_000_000,
) -> dict[str, pd.DataFrame]:
    if not path.exists():
        raise FileNotFoundError(
            f"Alibaba trace not found at {path}.\n"
            "Download machine_usage.tar.gz from "
            "https://github.com/alibaba/clusterdata/tree/master/cluster-trace-v2018, "
            f"extract it and place machine_usage.csv at {path}."
        )

    cluster_ids = [spec.id for spec in CLUSTER_SPECS]
    parts: list[pd.DataFrame] = []
    for chunk in pd.read_csv(
        path,
        header=None,
        names=COLUMNS,
        usecols=["machine_id", "time_stamp", "cpu_util_percent", "mem_util_percent", "net_in", "net_out"],
        chunksize=chunksize,
    ):
        chunk = chunk.dropna(subset=["cpu_util_percent", "mem_util_percent"])
        chunk["hour"] = (chunk["time_stamp"] // 3600).astype(int)
        # machine-level hourly means
        parts.append(
            chunk.groupby(["machine_id", "hour"], as_index=False)[
                ["cpu_util_percent", "mem_util_percent", "net_in", "net_out"]
            ].mean()
        )

    machines = pd.concat(parts).groupby(["machine_id", "hour"], as_index=False).mean()
    machines["cluster_id"] = machines["machine_id"].map(
        lambda m: cluster_ids[zlib.crc32(str(m).encode()) % len(cluster_ids)]
    )
    machines["network"] = machines["net_in"].fillna(0) + machines["net_out"].fillna(0)

    agg = machines.groupby(["cluster_id", "hour"]).agg(
        cpu=("cpu_util_percent", "sum"),
        mem_pct=("mem_util_percent", "sum"),
        network=("network", "sum"),
    )
    agg["memory"] = agg.pop("mem_pct") / 100.0 * server_memory_gb

    origin = pd.Timestamp(start)
    out: dict[str, pd.DataFrame] = {}
    for cid in cluster_ids:
        df = agg.loc[cid].copy()
        df.index = origin + pd.to_timedelta(df.index - df.index.min(), unit="h")
        full = pd.date_range(df.index.min(), df.index.max(), freq="h", tz="UTC")
        df = df.reindex(full).interpolate(limit_direction="both")
        df.index.name = "ts"
        out[cid] = df[["cpu", "memory", "network"]].round(2)
    return out
