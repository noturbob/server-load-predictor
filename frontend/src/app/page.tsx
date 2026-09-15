"use client";

import { AlertTriangle, ArrowRight, Gauge, PiggyBank, Server, Target } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { ActionList } from "@/components/action-list";
import { Sparkline } from "@/components/charts/sparkline";
import { KpiCard } from "@/components/kpi-card";
import { ErrorState } from "@/components/state";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClusters, useModelMetrics, useSimulation } from "@/hooks/use-api";
import { fmtCurrency, fmtFullDate, fmtNumber } from "@/lib/format";
import type { ClusterSummary } from "@/lib/types";

export default function OverviewPage() {
  const sim = useSimulation();
  const clusters = useClusters();
  const metrics = useModelMetrics();

  const kpis = useMemo(() => {
    const list = clusters.data ?? [];
    const production = (metrics.data ?? []).filter((m) => m.is_production && m.metric === "cpu");
    const smape = production.length ? production.reduce((s, m) => s + m.smape, 0) / production.length : null;
    return {
      current: list.reduce((s, c) => s + c.current_servers, 0),
      recommended: list.reduce((s, c) => s + c.recommended_servers, 0),
      savings: list.reduce((s, c) => s + c.weekly_cost.savings_vs_current, 0),
      atRisk: list.filter((c) => c.status === "at_risk" || c.status === "scale_up_soon").length,
      accuracy: smape === null ? null : 100 - smape,
    };
  }, [clusters.data, metrics.data]);

  const upcoming = useMemo(
    () =>
      (clusters.data ?? [])
        .flatMap((c) => c.upcoming_actions.map((a) => ({ ...a, clusterId: c.id, clusterName: c.name })))
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, 5),
    [clusters.data],
  );

  if (clusters.isError || sim.isError) return <ErrorState error={clusters.error ?? sim.error} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fleet overview</h1>
        <p className="text-sm text-muted-foreground">
          {sim.data ? `${fmtFullDate(sim.data.now)} · ` : ""}
          Forecasts for the next 7 days, turned into scaling actions before load arrives.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {clusters.data ? (
          <>
            <KpiCard label="Servers running" value={fmtNumber(kpis.current)} hint="across all clusters" icon={<Server className="size-4" />} />
            <KpiCard
              label="Recommended now"
              value={fmtNumber(kpis.recommended)}
              hint={
                kpis.recommended === kpis.current
                  ? "fleet is right-sized"
                  : `${kpis.recommended > kpis.current ? "+" : "−"}${Math.abs(kpis.recommended - kpis.current)} vs running`
              }
              icon={<Target className="size-4" />}
            />
            <KpiCard
              label="Weekly savings"
              value={fmtCurrency(Math.max(kpis.savings, 0))}
              hint={kpis.savings >= 0 ? "following the plan vs. running flat" : `plan costs ${fmtCurrency(-kpis.savings)} more to avoid overload`}
              icon={<PiggyBank className="size-4" />}
            />
            <KpiCard
              label="Forecast accuracy"
              value={kpis.accuracy === null ? "—" : `${kpis.accuracy.toFixed(1)}%`}
              hint="100 − sMAPE, CPU, 1–168h ahead"
              icon={<Gauge className="size-4" />}
            />
            <KpiCard
              label="Need attention"
              value={`${kpis.atRisk} of ${clusters.data.length}`}
              hint="at risk or scaling up within 24h"
              icon={<AlertTriangle className="size-4" />}
              className="col-span-2 lg:col-span-1"
            />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="grid gap-4 lg:col-span-2">
          {clusters.data
            ? clusters.data.map((c) => <ClusterCard key={c.id} cluster={c} now={sim.data?.now} />)
            : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Upcoming actions</CardTitle>
            <CardDescription>Next scaling steps across all clusters</CardDescription>
          </CardHeader>
          <CardContent>
            {clusters.data && sim.data ? (
              <ActionList actions={upcoming} now={sim.data.now} showCluster compact />
            ) : (
              <Skeleton className="h-48" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClusterCard({ cluster: c, now }: { cluster: ClusterSummary; now?: string }) {
  const delta = c.recommended_servers - c.current_servers;
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {c.name}
            <StatusBadge status={c.status} />
          </CardTitle>
          <CardDescription className="mt-1">{c.description}</CardDescription>
        </div>
        <Link
          href={`/clusters/${c.id}`}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Details <ArrowRight className="size-4" />
        </Link>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr] sm:items-center">
        <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Servers</dt>
            <dd className="tabular text-lg font-semibold">
              {c.current_servers}
              <span className="text-muted-foreground"> → </span>
              {c.recommended_servers}
            </dd>
            <dd className="text-xs text-muted-foreground">
              {delta === 0 ? "no change" : `${delta > 0 ? "add" : "remove"} ${Math.abs(delta)} now`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">CPU load</dt>
            <dd className="tabular text-lg font-semibold">{c.latest ? fmtNumber(c.latest.cpu) : "—"}</dd>
            <dd className="text-xs text-muted-foreground">
              {c.latest
                ? `${Math.round((c.latest.cpu / (c.current_servers * c.config.server_capacity)) * 100)}% of running capacity`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Weekly savings</dt>
            <dd className="tabular text-lg font-semibold">{fmtCurrency(c.weekly_cost.savings_vs_current)}</dd>
            <dd className="text-xs text-muted-foreground">peak need {c.peak_required_servers} servers</dd>
          </div>
        </dl>
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>CPU · last 24h</span>
            <span>next 24h forecast</span>
          </div>
          <Sparkline points={c.sparkline} now={now} height={96} />
        </div>
      </CardContent>
    </Card>
  );
}
