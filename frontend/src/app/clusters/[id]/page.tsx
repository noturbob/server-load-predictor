"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ActionList } from "@/components/action-list";
import { CapacityMeter } from "@/components/capacity-meter";
import { AccuracyChart } from "@/components/charts/accuracy-chart";
import { ForecastChart } from "@/components/charts/forecast-chart";
import { ServerPlanChart } from "@/components/charts/server-plan-chart";
import { PageHeading, Panel, PanelBody, PanelHeader, Readout, Segmented } from "@/components/panel";
import { ChartSkeleton, ErrorState } from "@/components/state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCluster,
  useForecast,
  useHistoryVsPredicted,
  useRecommendations,
  useSimulation,
  useUpdateConfig,
  useUsage,
} from "@/hooks/use-api";
import { METRIC_LABELS, MODEL_LABELS, fmtCurrency, fmtDayHour, fmtNumber } from "@/lib/format";
import type { ClusterSummary, CostSummary, ForecastPoint, Metric } from "@/lib/types";

const HORIZONS = [
  { value: 24, label: "24h", long: "next 24 hours" },
  { value: 72, label: "3d", long: "next 3 days" },
  { value: 168, label: "7d", long: "next 7 days" },
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
  const horizonLabel = HORIZONS.find((h) => h.value === horizon)?.long ?? "";
  const capacity = c ? capacityLine(c, metric) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow={
          <>
            <Link href="/" className="text-brand hover:underline">
              Fleet
            </Link>
            <span>/</span>
            <span>{id}</span>
          </>
        }
        title={c ? <span className="flex flex-wrap items-center gap-x-4 gap-y-2">{c.name}</span> : <Skeleton className="h-10 w-64" />}
        aside={c ? <ServerDecision cluster={c} /> : <Skeleton className="h-24 w-80" />}
      >
        {c && (
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={c.status} />
            <span>{c.description}</span>
          </div>
        )}
      </PageHeading>

      {/* One control row scopes every panel below. */}
      <div className="sticky top-[57px] z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-y bg-background/90 px-4 py-3 backdrop-blur-md sm:top-16 sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="eyebrow hidden sm:inline">Metric</span>
          <Segmented
            label="Metric"
            value={metric}
            onChange={setMetric}
            options={(Object.keys(METRIC_LABELS) as Metric[]).map((m) => ({ value: m, label: METRIC_LABELS[m].label }))}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="eyebrow hidden sm:inline">Horizon</span>
          <Segmented label="Forecast horizon" value={horizon} onChange={setHorizon} options={HORIZONS} />
        </div>
      </div>

      <Panel>
        <PanelHeader
          index="01"
          title={`${METRIC_LABELS[metric].label} load forecast`}
          description={
            <>
              Measured usage up to now, then the median forecast and its 80% range for the {horizonLabel} ({METRIC_LABELS[metric].unit}).
            </>
          }
          actions={
            forecast.data && (
              <span className="eyebrow rounded-full border px-2.5 py-1.5">{MODEL_LABELS[forecast.data.model] ?? forecast.data.model}</span>
            )
          }
        />
        {forecast.data && usage.data && (
          <ForecastSummary points={forecast.data.points} latest={usage.data.points.at(-1)?.value} unit={unit} capacity={capacity?.value} />
        )}
        <PanelBody>
          {usage.data && forecast.data && sim.data && c ? (
            <ForecastChart usage={usage.data.points} forecast={forecast.data.points} now={sim.data.now} unit={unit} capacity={capacity} height={340} />
          ) : usage.isError || forecast.isError ? (
            <ErrorState error={usage.error ?? forecast.error} />
          ) : (
            <ChartSkeleton height={372} />
          )}
        </PanelBody>
      </Panel>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            index="02"
            title="Server plan"
            description={
              c && (
                <>
                  Servers needed to keep p90 CPU and memory under {Math.round(c.config.target_utilization * 100)}%, with a{" "}
                  {c.config.lead_time_hours}h boot lead and a {c.config.scale_down_window}h scale-down window.
                </>
              )
            }
          />
          <PanelBody>
            {rec.data ? <ServerPlanChart plan={rec.data.plan} current={rec.data.current_servers} height={240} /> : <ChartSkeleton height={272} />}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            index="03"
            title="Cost ledger"
            description={c && <>The {horizonLabel} at {fmtCurrency(c.config.cost_per_server_hour, 2)} per server-hour.</>}
          />
          <PanelBody>{rec.data ? <CostLedger cost={rec.data.cost} /> : <Skeleton className="h-64" />}</PanelBody>
        </Panel>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Panel>
          <PanelHeader index="04" title="Recommended actions" description="What to change, when, and why." />
          <PanelBody className="max-h-[480px] overflow-y-auto">
            {rec.data && sim.data ? <ActionList actions={rec.data.actions} now={sim.data.now} limit={12} /> : <Skeleton className="h-64" />}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            index="05"
            title="Predicted vs. actual"
            description="The last 72 hours against what the model forecast 1 hour and 24 hours beforehand."
            actions={
              history.data && (
                <div className="flex gap-6 text-right">
                  <Readout size="sm" label="MAE · 1h" value={history.data.mae_1h !== null ? fmtNumber(history.data.mae_1h, 1) : "—"} />
                  <Readout size="sm" label="MAE · 24h" value={history.data.mae_24h !== null ? fmtNumber(history.data.mae_24h, 1) : "—"} />
                </div>
              )
            }
          />
          <PanelBody>{history.data ? <AccuracyChart points={history.data.points} unit={unit} height={260} /> : <ChartSkeleton height={292} />}</PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function capacityLine(c: ClusterSummary, metric: Metric) {
  const { current_servers, server_capacity, server_memory_gb, target_utilization } = c.config;
  const label = `Target capacity · ${current_servers} running`;
  if (metric === "cpu") return { value: current_servers * server_capacity * target_utilization, label };
  if (metric === "memory") return { value: current_servers * server_memory_gb * target_utilization, label };
  return undefined;
}

function ForecastSummary({
  points,
  latest,
  unit,
  capacity,
}: {
  points: ForecastPoint[];
  latest?: number;
  unit: string;
  capacity?: number;
}) {
  const stats = useMemo(() => {
    const peak = points.reduce((best, p) => (p.p50 > best.p50 ? p : best), points[0]);
    const p90 = points.reduce((best, p) => (p.p90 > best.p90 ? p : best), points[0]);
    return { peak, p90 };
  }, [points]);
  if (!stats.peak) return null;
  const over = capacity !== undefined && stats.p90.p90 > capacity;
  return (
    <div className="mx-5 mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 sm:mx-6 md:grid-cols-4">
      <Readout size="sm" label="Now" value={latest !== undefined ? `${fmtNumber(latest)} ${unit}` : "—"} />
      <Readout size="sm" label="Forecast peak" value={`${fmtNumber(stats.peak.p50)} ${unit}`} hint={fmtDayHour(stats.peak.ts)} />
      <Readout size="sm" label="Worst case · p90" value={`${fmtNumber(stats.p90.p90)} ${unit}`} hint={fmtDayHour(stats.p90.ts)} />
      <Readout
        size="sm"
        label="Headroom at peak"
        value={
          capacity === undefined ? (
            "n/a"
          ) : (
            <span className={over ? "text-status-critical" : undefined}>
              {over ? "−" : ""}
              {fmtNumber(Math.abs(capacity - stats.p90.p90))} {unit}
            </span>
          )
        }
        hint={capacity === undefined ? "network isn't sized" : over ? "p90 exceeds running capacity" : "p90 fits running capacity"}
      />
    </div>
  );
}

function ServerDecision({ cluster: c }: { cluster: ClusterSummary }) {
  const update = useUpdateConfig(c.id);
  const delta = c.recommended_servers - c.current_servers;

  const apply = () =>
    update.mutate(
      { current_servers: c.recommended_servers },
      {
        onSuccess: () => toast.success(`${c.name} is now running ${c.recommended_servers} servers`),
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Panel className="w-full p-5 sm:w-[380px]">
      <div className="flex items-end justify-between gap-4">
        <Readout
          label="Running → recommended"
          size="lg"
          value={
            <span className="tabular">
              {c.current_servers}
              <span className="mx-2 text-muted-foreground">→</span>
              {c.recommended_servers}
            </span>
          }
        />
        <Button onClick={apply} disabled={delta === 0 || update.isPending} className="h-9 gap-1.5 px-3.5">
          <Check className="size-4" />
          {delta === 0 ? "Right-sized" : `Apply ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}
        </Button>
      </div>
      <CapacityMeter className="mt-5" current={c.current_servers} recommended={c.recommended_servers} peak={c.peak_required_servers} />
    </Panel>
  );
}

function CostLedger({ cost }: { cost: CostSummary }) {
  const max = Math.max(cost.planned_cost, cost.static_peak_cost, cost.current_cost, 1);
  const rows = [
    { label: "Follow the plan", value: cost.planned_cost, primary: true },
    { label: "Hold current servers", value: cost.current_cost },
    { label: "Provision for the peak", value: cost.static_peak_cost },
  ];
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={r.primary ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{r.label}</span>
              <span className="font-mono text-sm tabular">{fmtCurrency(r.value)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={r.primary ? "h-full rounded-full bg-foreground" : "h-full rounded-full bg-muted-foreground/35"}
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5">
        <Readout label="Saved vs. holding" value={fmtCurrency(cost.savings_vs_current)} />
        <Readout
          label="Saved vs. peak sizing"
          value={fmtCurrency(cost.savings_vs_static)}
          hint={`${cost.savings_pct_vs_static}% less spend`}
        />
        <Readout
          label="Hours under capacity"
          value={<span className={cost.hours_at_risk > 0 ? "text-status-critical" : undefined}>{cost.hours_at_risk}</span>}
          hint="if nothing changes"
        />
        <Readout label="Hours over-provisioned" value={cost.hours_over_provisioned} hint="if nothing changes" />
      </dl>
    </div>
  );
}
