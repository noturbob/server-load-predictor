"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ActionList } from "@/components/action-list";
import { AccuracyChart } from "@/components/charts/accuracy-chart";
import { ForecastChart } from "@/components/charts/forecast-chart";
import { ServerPlanChart } from "@/components/charts/server-plan-chart";
import { ChartSkeleton, ErrorState } from "@/components/state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCluster,
  useForecast,
  useHistoryVsPredicted,
  useRecommendations,
  useSimulation,
  useUpdateConfig,
  useUsage,
} from "@/hooks/use-api";
import { METRIC_LABELS, MODEL_LABELS, fmtCurrency, fmtNumber } from "@/lib/format";
import type { ClusterSummary, CostSummary, Metric } from "@/lib/types";

const HORIZONS = [
  { value: 24, label: "Next 24 hours" },
  { value: 72, label: "Next 3 days" },
  { value: 168, label: "Next 7 days" },
];

export default function ClusterPage() {
  const { id } = useParams<{ id: string }>();
  const [metric, setMetric] = useState<Metric>("cpu");
  const [horizon, setHorizon] = useState(72);

  const sim = useSimulation();
  const cluster = useCluster(id);
  const usage = useUsage(id, metric, Math.max(48, horizon));
  const forecast = useForecast(id, metric, horizon);
  const history = useHistoryVsPredicted(id, metric, 72);
  const rec = useRecommendations(id, horizon);

  if (cluster.isError) return <ErrorState error={cluster.error} />;

  const c = cluster.data;
  const unit = METRIC_LABELS[metric].short;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Overview
        </Link>
        {c ? <ClusterHeader cluster={c} /> : <Skeleton className="h-16 w-full max-w-xl" />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <TabsList>
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <TabsTrigger key={m} value={m}>
                {METRIC_LABELS[m].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
          <SelectTrigger className="w-40" aria-label="Forecast horizon">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HORIZONS.map((h) => (
              <SelectItem key={h.value} value={String(h.value)}>
                {h.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {METRIC_LABELS[metric].label} load forecast
          </CardTitle>
          <CardDescription>
            Actual usage up to now, then the model&apos;s median forecast with an 80% range ({METRIC_LABELS[metric].unit}).
            {forecast.data && ` Model: ${MODEL_LABELS[forecast.data.model] ?? forecast.data.model}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usage.data && forecast.data && sim.data && c ? (
            <ForecastChart
              usage={usage.data.points}
              forecast={forecast.data.points}
              now={sim.data.now}
              unit={unit}
              capacity={capacityLine(c, metric)}
            />
          ) : usage.isError || forecast.isError ? (
            <ErrorState error={usage.error ?? forecast.error} />
          ) : (
            <ChartSkeleton height={352} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Server plan</CardTitle>
            <CardDescription>
              Servers needed to keep p90 CPU and memory under the {c ? `${Math.round(c.config.target_utilization * 100)}%` : ""}{" "}
              target, with a {c?.config.lead_time_hours ?? 1}h boot lead time and a{" "}
              {c?.config.scale_down_window ?? 6}h scale-down window.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rec.data ? (
              <ServerPlanChart plan={rec.data.plan} current={rec.data.current_servers} />
            ) : (
              <ChartSkeleton height={252} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cost for this window</CardTitle>
            <CardDescription>{HORIZONS.find((h) => h.value === horizon)?.label}, at {c ? fmtCurrency(c.config.cost_per_server_hour, 2) : "…"}/server-hour</CardDescription>
          </CardHeader>
          <CardContent>{rec.data ? <CostBreakdown cost={rec.data.cost} /> : <Skeleton className="h-52" />}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recommended actions</CardTitle>
            <CardDescription>What to do, when, and why</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto">
            {rec.data && sim.data ? (
              <ActionList actions={rec.data.actions} now={sim.data.now} limit={12} />
            ) : (
              <Skeleton className="h-64" />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Predicted vs. actual</CardTitle>
            <CardDescription>
              The last 72 hours, compared with what the model forecast 1 hour and 24 hours beforehand.
            </CardDescription>
            {history.data && (
              <CardAction className="flex flex-col items-end gap-0.5 text-right text-xs text-muted-foreground">
                <span>
                  MAE 1h: <span className="tabular font-medium text-foreground">{history.data.mae_1h !== null ? `${fmtNumber(history.data.mae_1h, 1)} ${unit}` : "—"}</span>
                </span>
                <span>
                  MAE 24h: <span className="tabular font-medium text-foreground">{history.data.mae_24h !== null ? `${fmtNumber(history.data.mae_24h, 1)} ${unit}` : "—"}</span>
                </span>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {history.data ? <AccuracyChart points={history.data.points} unit={unit} /> : <ChartSkeleton height={272} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function capacityLine(c: ClusterSummary, metric: Metric) {
  const { current_servers, server_capacity, server_memory_gb, target_utilization } = c.config;
  if (metric === "cpu") {
    return { value: current_servers * server_capacity * target_utilization, label: "Target capacity (running servers)" };
  }
  if (metric === "memory") {
    return { value: current_servers * server_memory_gb * target_utilization, label: "Target capacity (running servers)" };
  }
  return undefined;
}

function ClusterHeader({ cluster: c }: { cluster: ClusterSummary }) {
  const update = useUpdateConfig(c.id);
  const delta = c.recommended_servers - c.current_servers;

  const apply = () =>
    update.mutate(
      { current_servers: c.recommended_servers },
      {
        onSuccess: () => toast.success(`${c.name} now running ${c.recommended_servers} servers`),
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          {c.name}
          <StatusBadge status={c.status} />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Running → recommended now</div>
          <div className="tabular text-2xl font-semibold">
            {c.current_servers} <span className="text-muted-foreground">→</span> {c.recommended_servers}
          </div>
        </div>
        <Button onClick={apply} disabled={delta === 0 || update.isPending}>
          <Check className="size-4" />
          {delta === 0 ? "Right-sized" : `Apply (${delta > 0 ? "+" : "−"}${Math.abs(delta)})`}
        </Button>
      </div>
    </div>
  );
}

function CostBreakdown({ cost }: { cost: CostSummary }) {
  const max = Math.max(cost.planned_cost, cost.static_peak_cost, cost.current_cost, 1);
  const rows = [
    { label: "Follow the plan", value: cost.planned_cost, strong: true },
    { label: "Keep current servers", value: cost.current_cost },
    { label: "Provision for the peak", value: cost.static_peak_cost },
  ];
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span className={r.strong ? "font-medium" : "text-muted-foreground"}>{r.label}</span>
              <span className="tabular font-medium">{fmtCurrency(r.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${(r.value / max) * 100}%`, background: r.strong ? "var(--chart-1)" : "var(--chart-muted)" }}
              />
            </div>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Saved vs. current</dt>
          <dd className="tabular text-lg font-semibold">{fmtCurrency(cost.savings_vs_current)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Saved vs. peak sizing</dt>
          <dd className="tabular text-lg font-semibold">
            {fmtCurrency(cost.savings_vs_static)}{" "}
            <span className="text-xs font-normal text-muted-foreground">({cost.savings_pct_vs_static}%)</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Hours under capacity</dt>
          <dd className="tabular text-lg font-semibold">{cost.hours_at_risk}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Hours over-provisioned</dt>
          <dd className="tabular text-lg font-semibold">{cost.hours_over_provisioned}</dd>
        </div>
      </dl>
    </div>
  );
}
