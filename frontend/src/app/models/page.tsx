"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MODEL_ORDER, ModelMaeChart, type MaeRow } from "@/components/charts/model-mae-chart";
import { ChartSkeleton, ErrorState } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClusters, useModelMetrics } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { METRIC_LABELS, MODEL_LABELS, fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";
import type { Metric } from "@/lib/types";

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
  const chartData = useMemo<MaeRow[]>(() => {
    const byCluster = new Map<string, MaeRow>();
    for (const r of rows) {
      const label = names[r.cluster_id] ?? r.cluster_id;
      const row = byCluster.get(r.cluster_id) ?? { cluster: label };
      row[r.model_name as (typeof MODEL_ORDER)[number]] = r.mae;
      byCluster.set(r.cluster_id, row);
    }
    return [...byCluster.values()];
  }, [rows, names]);

  const retrain = async () => {
    setRetraining(true);
    const id = toast.loading("Retraining models on all data up to the simulated now…");
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
  const trainedAt = metrics.data?.[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Model comparison</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every model is backtested on the last 21 days of its training data, forecasting 1–168 hours ahead from a
            new origin each day. The model with the lowest error becomes the production model for that series.
            {trainedAt && ` Trained on data up to ${fmtDateTime(trainedAt.train_end)}.`}
          </p>
        </div>
        <Button onClick={retrain} disabled={retraining}>
          <RefreshCw className={retraining ? "size-4 animate-spin" : "size-4"} />
          {retraining ? "Retraining…" : "Retrain with latest data"}
        </Button>
      </div>

      <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
        <TabsList>
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <TabsTrigger key={m} value={m}>
              {METRIC_LABELS[m].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Mean absolute error by cluster</CardTitle>
          <CardDescription>Lower is better · {METRIC_LABELS[metric].unit}</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.data ? <ModelMaeChart data={chartData} unit={METRIC_LABELS[metric].short} /> : <ChartSkeleton height={290} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backtest results</CardTitle>
          <CardDescription>
            sMAPE = symmetric mean absolute percentage error. Coverage = share of actuals inside the 80% forecast range
            (ideal ≈ 80%).
          </CardDescription>
          <CardAction className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Star className="size-3.5 fill-current" /> production model
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="tabular">
            <TableHeader>
              <TableRow>
                <TableHead>Cluster</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">MAE</TableHead>
                <TableHead className="text-right">RMSE</TableHead>
                <TableHead className="text-right">sMAPE</TableHead>
                <TableHead className="text-right">80% coverage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.cluster_id}-${r.model_name}`} className={r.is_production ? "bg-muted/50 font-medium" : ""}>
                  <TableCell>{names[r.cluster_id] ?? r.cluster_id}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {MODEL_LABELS[r.model_name] ?? r.model_name}
                      {r.is_production && <Star className="size-3.5 fill-current" aria-label="production model" />}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{fmtNumber(r.mae, 1)}</TableCell>
                  <TableCell className="text-right">{fmtNumber(r.rmse, 1)}</TableCell>
                  <TableCell className="text-right">{fmtNumber(r.smape, 1)}%</TableCell>
                  <TableCell className="text-right">{fmtPercent(r.coverage_80)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
