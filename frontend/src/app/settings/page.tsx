"use client";

import { useState } from "react";
import { toast } from "sonner";

import { PageHeading, Panel, Readout } from "@/components/panel";
import { ErrorState } from "@/components/state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useClusters, useUpdateConfig } from "@/hooks/use-api";
import type { ClusterConfig, ClusterSummary } from "@/lib/types";

export default function SettingsPage() {
  const clusters = useClusters();
  if (clusters.isError) return <ErrorState error={clusters.error} />;

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow={
          <>
            <span className="text-brand">Policy</span>
            <span>/</span>
            <span>scaling rules per cluster</span>
          </>
        }
        title="How a forecast becomes a server count."
      >
        <p>
          Servers are sized so the p90 forecast stays under the target utilization, started early enough to boot, and removed only once
          load has stayed low. Recommendations recalculate the moment you save.
        </p>
      </PageHeading>

      <div className="flex flex-col gap-6">
        {clusters.data
          ? clusters.data.map((c, i) => <ClusterPolicy key={c.id} cluster={c} index={i + 1} />)
          : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-lg" />)}
      </div>
    </div>
  );
}

type Field = { key: keyof ClusterConfig; label: string; unit?: string; step?: number; min?: number };

const GROUPS: { title: string; hint: string; fields: Field[] }[] = [
  {
    title: "Fleet",
    hint: "What's running and the bounds the plan must respect.",
    fields: [
      { key: "current_servers", label: "Running now", unit: "servers", min: 0 },
      { key: "min_servers", label: "Minimum", unit: "servers", min: 0 },
      { key: "max_servers", label: "Maximum", unit: "servers", min: 1 },
    ],
  },
  {
    title: "Hardware",
    hint: "Capacity and price of a single server.",
    fields: [
      { key: "server_capacity", label: "CPU", unit: "units", min: 1 },
      { key: "server_memory_gb", label: "Memory", unit: "GB", min: 1 },
      { key: "cost_per_server_hour", label: "Price", unit: "$/h", step: 0.01, min: 0 },
    ],
  },
  {
    title: "Timing",
    hint: "Boot time before load, and patience before scaling down.",
    fields: [
      { key: "lead_time_hours", label: "Boot lead", unit: "hours", min: 0 },
      { key: "scale_down_window", label: "Scale-down wait", unit: "hours", min: 1 },
    ],
  },
];

function ClusterPolicy({ cluster, index }: { cluster: ClusterSummary; index: number }) {
  const [form, setForm] = useState<ClusterConfig>(cluster.config);
  const update = useUpdateConfig(cluster.id);

  const dirty = (Object.keys(form) as (keyof ClusterConfig)[]).some((k) => form[k] !== cluster.config[k]);
  const invalid = form.min_servers > form.max_servers;
  const incomplete = Object.values(form).some((v) => !Number.isFinite(v));
  const target = Math.round(form.target_utilization * 100);

  const save = () =>
    update.mutate(form, {
      onSuccess: (saved) => {
        setForm(saved);
        toast.success(`Saved policy for ${cluster.name}`);
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <Panel className="grid overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 border-b p-6 lg:border-r lg:border-b-0">
        <div>
          <div className="font-mono text-[11px] text-brand">0{index}</div>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{cluster.name}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{cluster.description}</p>
        </div>
        <StatusBadge status={cluster.status} className="self-start" />
        <div className="grid grid-cols-2 gap-4 border-t pt-5">
          <Readout size="sm" label="Recommended" value={`${cluster.recommended_servers} now`} />
          <Readout size="sm" label="Peak · 7d" value={`${cluster.peak_required_servers}`} />
        </div>

        <div className="border-t pt-5">
          <div className="flex items-end justify-between">
            <Label htmlFor={`${cluster.id}-target`} className="eyebrow">
              Target utilization
            </Label>
            <span className="text-[34px] leading-none font-medium tracking-[-0.02em]">
              {target}
              <span className="text-lg text-muted-foreground">%</span>
            </span>
          </div>
          <Slider
            id={`${cluster.id}-target`}
            className="mt-4"
            min={30}
            max={95}
            step={5}
            value={[target]}
            onValueChange={([v]) => setForm((f) => ({ ...f, target_utilization: v / 100 }))}
          />
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground uppercase">
            <span>More headroom</span>
            <span>Fewer servers</span>
          </div>
        </div>
      </aside>

      <div className="flex flex-col">
        <div className="grid flex-1 divide-y">
          {GROUPS.map((g) => (
            <fieldset key={g.title} className="grid gap-4 p-6 md:grid-cols-[180px_minmax(0,1fr)]">
              <div>
                <legend className="text-sm font-medium">{g.title}</legend>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{g.hint}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {g.fields.map((f) => {
                  const bad = (f.key === "min_servers" || f.key === "max_servers") && invalid;
                  return (
                    <div key={f.key} className="flex flex-col gap-1.5">
                      <Label htmlFor={`${cluster.id}-${f.key}`} className="eyebrow">
                        {f.label}
                      </Label>
                      <div className="relative">
                        <Input
                          id={`${cluster.id}-${f.key}`}
                          type="number"
                          inputMode="decimal"
                          min={f.min}
                          step={f.step ?? 1}
                          value={Number.isFinite(form[f.key]) ? form[f.key] : ""}
                          onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.valueAsNumber }))}
                          aria-invalid={bad}
                          className="h-10 pr-14 font-mono text-[14px] tabular"
                        />
                        {f.unit && (
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[11px] text-muted-foreground">
                            {f.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-surface-2 px-6 py-4">
          <span className="text-[13px] text-muted-foreground">
            {invalid ? (
              <span className="text-destructive">Minimum servers must not exceed maximum servers.</span>
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              "All changes saved"
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={!dirty || update.isPending} onClick={() => setForm(cluster.config)}>
              Discard
            </Button>
            <Button disabled={!dirty || invalid || incomplete || update.isPending} onClick={save}>
              {update.isPending ? "Saving…" : "Save policy"}
            </Button>
          </div>
        </footer>
      </div>
    </Panel>
  );
}
