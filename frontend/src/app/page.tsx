"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { ActionList } from "@/components/action-list";
import { CapacityMeter } from "@/components/capacity-meter";
import { Sparkline } from "@/components/charts/sparkline";
import { PageHeading, Panel, PanelBody, Readout } from "@/components/panel";
import { ErrorState } from "@/components/state";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useClusters, useModelMetrics, useSimulation } from "@/hooks/use-api";
import { fmtCurrency, fmtFullDate, fmtNumber } from "@/lib/format";
import type { ClusterSummary } from "@/lib/types";

export default function OverviewPage() {
  const sim = useSimulation();
  const clusters = useClusters();
  const metrics = useModelMetrics();

  const summary = useMemo(() => {
    const list = clusters.data ?? [];
    const production = (metrics.data ?? []).filter((m) => m.is_production && m.metric === "cpu");
    const smape = production.length ? production.reduce((s, m) => s + m.smape, 0) / production.length : null;
    return {
      current: list.reduce((s, c) => s + c.current_servers, 0),
      recommended: list.reduce((s, c) => s + c.recommended_servers, 0),
      peak: list.reduce((s, c) => s + c.peak_required_servers, 0),
      savings: list.reduce((s, c) => s + c.weekly_cost.savings_vs_current, 0),
      attention: list.filter((c) => c.status === "at_risk" || c.status === "scale_up_soon"),
      accuracy: smape === null ? null : 100 - smape,
    };
  }, [clusters.data, metrics.data]);

  const upcoming = useMemo(
    () =>
      (clusters.data ?? [])
        .flatMap((c) => c.upcoming_actions.map((a) => ({ ...a, clusterId: c.id, clusterName: c.name })))
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, 6),
    [clusters.data],
  );

  if (clusters.isError || sim.isError) return <ErrorState error={clusters.error ?? sim.error} />;

  const n = summary.attention.length;
  const delta = summary.recommended - summary.current;

  return (
    <div className="flex flex-col gap-10">
      <PageHeading
        eyebrow={
          <>
            <span className="text-brand">Fleet</span>
            <span>/</span>
            <span>{sim.data ? fmtFullDate(sim.data.now) : "…"}</span>
          </>
        }
        title={
          clusters.data ? (
            n === 0 ? (
              <>Capacity is covered for the next 24 hours.</>
            ) : (
              <>
                {n} of {clusters.data.length} clusters need <span className="text-brand">more capacity</span> within 24 hours.
              </>
            )
          ) : (
            <Skeleton className="h-10 w-[28ch] max-w-full" />
          )
        }
      >
        {clusters.data && (
          <p>
            Following the forecast plan saves{" "}
            <span className="font-medium text-foreground">{fmtCurrency(Math.max(summary.savings, 0))}</span> over the next 7 days
            compared with holding today&apos;s {summary.current} servers.
          </p>
        )}
      </PageHeading>

      {/* Instrument strip */}
      <Panel className="grid grid-cols-2 divide-border md:grid-cols-5 md:divide-x [&>*]:border-border max-md:[&>*:nth-child(n+3)]:border-t max-md:[&>*:nth-child(odd):not(:last-child)]:border-r">
        {clusters.data ? (
          <>
            <Readout className="p-5" size="lg" label="Running" value={fmtNumber(summary.current)} hint="servers across the fleet" />
            <Readout
              className="p-5"
              size="lg"
              label="Recommended now"
              value={fmtNumber(summary.recommended)}
              hint={delta === 0 ? "right-sized" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs running`}
            />
            <Readout className="p-5" size="lg" label="Peak need · 7d" value={fmtNumber(summary.peak)} hint="sum of cluster peaks (p90)" />
            <Readout
              className="p-5"
              size="lg"
              label="Saved · 7d"
              value={fmtCurrency(Math.max(summary.savings, 0))}
              hint={summary.savings >= 0 ? "vs running flat" : `plan costs ${fmtCurrency(-summary.savings)} more`}
            />
            <Readout
              className="col-span-2 p-5 md:col-span-1"
              size="lg"
              label="Forecast accuracy"
              value={summary.accuracy === null ? "—" : `${summary.accuracy.toFixed(1)}%`}
              hint="100 − sMAPE · CPU · 1–168h"
            />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-8 w-16" />
            </div>
          ))
        )}
      </Panel>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          <SectionRule index="01" title="Clusters" />
          {clusters.data
            ? clusters.data.map((c) => <ClusterRow key={c.id} cluster={c} now={sim.data?.now} />)
            : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
        </section>

        <section className="flex flex-col gap-4">
          <SectionRule index="02" title="Next actions" />
          <Panel className="xl:sticky xl:top-24">
            <PanelBody className="pt-5">
              {clusters.data && sim.data ? (
                <ActionList actions={upcoming} now={sim.data.now} showCluster compact />
              ) : (
                <Skeleton className="h-64" />
              )}
            </PanelBody>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function SectionRule({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] text-brand">{index}</span>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function ClusterRow({ cluster: c, now }: { cluster: ClusterSummary; now?: string }) {
  const utilization = c.latest ? c.latest.cpu / (c.current_servers * c.config.server_capacity) : null;
  return (
    <Link href={`/clusters/${c.id}`} className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2">
      <Panel className="grid transition-colors group-hover:border-foreground/25 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                {c.name}
                <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{c.description}</p>
            </div>
            <StatusBadge status={c.status} className="shrink-0" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Readout
              label="Servers"
              value={
                <span className="tabular">
                  {c.current_servers}
                  <span className="mx-1 text-muted-foreground">→</span>
                  {c.recommended_servers}
                </span>
              }
            />
            <Readout
              label="CPU now"
              value={c.latest ? fmtNumber(c.latest.cpu) : "—"}
              hint={utilization === null ? undefined : `${Math.round(utilization * 100)}% of running`}
            />
            <Readout label="Saved · 7d" value={fmtCurrency(c.weekly_cost.savings_vs_current)} />
          </div>

          <CapacityMeter current={c.current_servers} recommended={c.recommended_servers} peak={c.peak_required_servers} />
        </div>

        <div className="flex flex-col border-t p-5 sm:p-6 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between">
            <span className="eyebrow">CPU · past 24h</span>
            <span className="eyebrow">
              <span className="text-brand">Forecast</span> · next 24h
            </span>
          </div>
          <div className="mt-3 flex-1">
            <Sparkline points={c.sparkline} now={now} height={150} />
          </div>
        </div>
      </Panel>
    </Link>
  );
}
