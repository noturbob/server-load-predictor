"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeading, Panel, PanelBody, PanelHeader, Segmented } from "@/components/panel";
import { ErrorState } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClusters, useModelMetrics } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { METRIC_LABELS, MODEL_LABELS, fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";
import type { Metric, ModelMetric } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ModelsPage() {
  const metrics = useModelMetrics();
  const clusters = useClusters();
  const [metric, setMetric] = useState<Metric>("cpu");
  const [retraining, setRetraining] = useState(false);
  const qc = useQueryClient();

  const names = useMemo(
    () => Object.fromEntries((clusters.data ?? []).map((c) => [c.id, c.name])) as Record<string, string>,
    [clusters.data],
  );
  const rows = useMemo(() => (metrics.data ?? []).filter((m) => m.metric === metric), [metrics.data, metric]);
  const byCluster = useMemo(() => {
    const groups = new Map<string, ModelMetric[]>();
    for (const r of rows) groups.set(r.cluster_id, [...(groups.get(r.cluster_id) ?? []), r]);
    return [...groups.entries()].map(([id, list]) => ({ id, list: list.sort((a, b) => a.mae - b.mae) }));
  }, [rows]);

  const retrain = async () => {
    setRetraining(true);
    const id = toast.loading("Retraining on all data up to the simulated now…");
    try {
      let job = await api.retrain();
      while (job.status === "queued" || job.status === "running") {
        toast.loading(job.message || "Training…", { id });
        await new Promise((r) => setTimeout(r, 1500));
        job = await api.retrainStatus(job.id);
      }
      if (job.status === "done") {
        toast.success(job.message, { id });
        await qc.invalidateQueries();
      } else {
        toast.error(job.error ?? "Retraining failed", { id });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { id });
    } finally {
      setRetraining(false);
    }
  };

  if (metrics.isError) return <ErrorState error={metrics.error} />;
  const trainEnd = metrics.data?.[0]?.train_end;

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow={
          <>
            <span className="text-brand">Models</span>
            <span>/</span>
            <span>{trainEnd ? `trained to ${fmtDateTime(trainEnd)}` : "…"}</span>
          </>
        }
        title="Three forecasters enter. The lowest error ships."
        aside={
          <Button onClick={retrain} disabled={retraining} className="h-10 gap-2 px-4">
            <RefreshCw className={cn("size-4", retraining && "animate-spin")} />
            {retraining ? "Retraining…" : "Retrain on latest data"}
          </Button>
        }
      >
        <p>
          Each model is backtested on the last 21 days of its training data, forecasting 1–168 hours ahead from a fresh origin every day.
          The one with the lowest mean absolute error becomes the production model for that series.
        </p>
      </PageHeading>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <div className="flex items-center gap-3">
          <span className="eyebrow">Metric</span>
          <Segmented
            label="Metric"
            value={metric}
            onChange={setMetric}
            options={(Object.keys(METRIC_LABELS) as Metric[]).map((m) => ({ value: m, label: METRIC_LABELS[m].label }))}
          />
        </div>
        <span className="eyebrow">Error in {METRIC_LABELS[metric].unit} · lower is better</span>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {metrics.data
          ? byCluster.map(({ id, list }, i) => (
              <Panel key={id}>
                <PanelHeader index={`0${i + 1}`} title={names[id] ?? id} description="Mean absolute error" />
                <PanelBody>
                  <Scorecard list={list} />
                </PanelBody>
              </Panel>
            ))
          : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-lg" />)}
      </div>

      <Panel>
        <PanelHeader
          index="04"
          title="Backtest results"
          description="sMAPE is symmetric mean absolute percentage error. Coverage is the share of actuals that landed inside the 80% forecast range; ideal is about 80%."
        />
        <PanelBody className="overflow-x-auto px-0 sm:px-0">
          <Table className="tabular">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Cluster", "Model", "MAE", "RMSE", "sMAPE", "80% coverage"].map((h, i) => (
                  <TableHead key={h} className={cn("eyebrow h-10 first:pl-6 last:pr-6", i > 1 && "text-right")}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.cluster_id}-${r.model_name}`}>
                  <TableCell className="pl-6 text-muted-foreground">{names[r.cluster_id] ?? r.cluster_id}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-1.5 rounded-full", r.is_production ? "bg-brand" : "bg-transparent")} />
                      <span className={r.is_production ? "font-medium" : undefined}>{MODEL_LABELS[r.model_name] ?? r.model_name}</span>
                      {r.is_production && <span className="eyebrow text-brand">prod</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px]">{fmtNumber(r.mae, 1)}</TableCell>
                  <TableCell className="text-right font-mono text-[13px]">{fmtNumber(r.rmse, 1)}</TableCell>
                  <TableCell className="text-right font-mono text-[13px]">{fmtNumber(r.smape, 1)}%</TableCell>
                  <TableCell className="pr-6 text-right font-mono text-[13px]">{fmtPercent(r.coverage_80)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelBody>
      </Panel>
    </div>
  );
}

/** Ranked horizontal bars: the production model in ink, the rest recede. */
function Scorecard({ list }: { list: ModelMetric[] }) {
  const max = Math.max(...list.map((m) => m.mae));
  const best = list[0];
  const runnerUp = list[1];
  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-4">
        {list.map((m, i) => (
          <li key={m.model_name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("flex items-center gap-2", i === 0 ? "font-medium" : "text-muted-foreground")}>
                <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
                {MODEL_LABELS[m.model_name] ?? m.model_name}
              </span>
              <span className="font-mono text-[13px] tabular">{fmtNumber(m.mae, 1)}</span>
            </div>
            <div className="mt-2 h-2 rounded-[2px] bg-muted">
              <div
                className={cn("h-full rounded-[2px]", i === 0 ? "bg-foreground" : "bg-muted-foreground/35")}
                style={{ width: `${(m.mae / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
      {best && runnerUp && (
        <p className="border-t pt-4 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{MODEL_LABELS[best.model_name]}</span> is{" "}
          <span className="font-medium text-foreground">{Math.round((1 - best.mae / runnerUp.mae) * 100)}%</span> more accurate than the
          runner-up, and {fmtPercent(best.coverage_80)} of actuals landed inside its 80% range.
        </p>
      )}
    </div>
  );
}
