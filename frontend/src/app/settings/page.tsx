"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scaling policy</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          How each cluster turns a forecast into a server count. Recommendations recalculate as soon as you save.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {clusters.data
          ? clusters.data.map((c) => <ClusterSettings key={c.id} cluster={c} />)
          : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[520px] rounded-xl" />)}
      </div>
    </div>
  );
}

type NumberField = {
  key: keyof ClusterConfig;
  label: string;
  hint: string;
  step?: number;
  min?: number;
};

const FIELDS: NumberField[] = [
  { key: "current_servers", label: "Servers running", hint: "What's provisioned right now", min: 0 },
  { key: "server_capacity", label: "CPU per server", hint: "Load units one server handles at 100%", min: 1 },
  { key: "server_memory_gb", label: "Memory per server (GB)", hint: "RAM per server", min: 1 },
  { key: "cost_per_server_hour", label: "Cost per server-hour ($)", hint: "On-demand price", step: 0.01, min: 0 },
  { key: "min_servers", label: "Minimum servers", hint: "Never scale below", min: 0 },
  { key: "max_servers", label: "Maximum servers", hint: "Never scale above", min: 1 },
  { key: "lead_time_hours", label: "Boot lead time (h)", hint: "Add servers this early", min: 0 },
  { key: "scale_down_window", label: "Scale-down window (h)", hint: "Load must stay low this long", min: 1 },
];

function ClusterSettings({ cluster }: { cluster: ClusterSummary }) {
  const [form, setForm] = useState<ClusterConfig>(cluster.config);
  const update = useUpdateConfig(cluster.id);

  const dirty = (Object.keys(form) as (keyof ClusterConfig)[]).some((k) => form[k] !== cluster.config[k]);
  const invalid = form.min_servers > form.max_servers;

  const save = () =>
    update.mutate(form, {
      onSuccess: (saved) => {
        setForm(saved);
        toast.success(`Saved policy for ${cluster.name}`);
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cluster.name}</CardTitle>
        <CardDescription>
          Currently recommends {cluster.recommended_servers} servers now, peaking at {cluster.peak_required_servers} this week.
        </CardDescription>
        <CardAction>
          <StatusBadge status={cluster.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${cluster.id}-target`}>Target utilization</Label>
            <span className="tabular text-sm font-medium">{Math.round(form.target_utilization * 100)}%</span>
          </div>
          <Slider
            id={`${cluster.id}-target`}
            min={30}
            max={95}
            step={5}
            value={[Math.round(form.target_utilization * 100)]}
            onValueChange={([v]) => setForm((f) => ({ ...f, target_utilization: v / 100 }))}
          />
          <p className="text-xs text-muted-foreground">
            Lower = more headroom and more servers. The p90 forecast must stay under this share of capacity.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`${cluster.id}-${f.key}`}>{f.label}</Label>
              <Input
                id={`${cluster.id}-${f.key}`}
                type="number"
                inputMode="decimal"
                min={f.min}
                step={f.step ?? 1}
                value={Number.isFinite(form[f.key]) ? form[f.key] : ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.valueAsNumber }))}
                aria-invalid={(f.key === "min_servers" || f.key === "max_servers") && invalid}
              />
              <span className="text-xs text-muted-foreground">{f.hint}</span>
            </div>
          ))}
        </div>
        {invalid && <p className="text-sm text-destructive">Minimum servers must not exceed maximum servers.</p>}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" disabled={!dirty || update.isPending} onClick={() => setForm(cluster.config)}>
          Reset
        </Button>
        <Button
          disabled={!dirty || invalid || update.isPending || Object.values(form).some((v) => !Number.isFinite(v))}
          onClick={save}
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </CardFooter>
    </Card>
  );
}
