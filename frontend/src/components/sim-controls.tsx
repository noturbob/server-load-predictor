"use client";

import { FastForward, Pause, Play, RotateCcw, StepForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSimulation, useSimulationControls } from "@/hooks/use-api";
import { fmtDateTime } from "@/lib/format";

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SimControls() {
  const { data: sim, isError } = useSimulation();
  const controls = useSimulationControls();
  const busy = controls.step.isPending || controls.reset.isPending;

  if (isError) {
    return <span className="text-xs text-muted-foreground">API offline</span>;
  }
  if (!sim) {
    return <span className="text-xs text-muted-foreground">Connecting…</span>;
  }

  const atEnd = sim.progress >= 1;

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background py-0.5 pr-1 pl-3">
      <div className="mr-2 flex flex-col leading-tight">
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
          Simulated time {sim.running && <span className="text-status-good">● live</span>}
        </span>
        <span className="tabular text-sm font-medium">{fmtDateTime(sim.now)}</span>
        <span className="mt-0.5 h-0.5 w-full overflow-hidden rounded bg-muted">
          <span className="block h-full bg-chart-1" style={{ width: `${sim.progress * 100}%` }} />
        </span>
      </div>
      {sim.running ? (
        <IconButton label="Pause" onClick={() => controls.pause.mutate()}>
          <Pause className="size-4" />
        </IconButton>
      ) : (
        <IconButton label={`Play (1 hour every ${sim.tick_seconds}s)`} onClick={() => controls.play.mutate()} disabled={atEnd}>
          <Play className="size-4" />
        </IconButton>
      )}
      <IconButton label="Advance 1 hour" onClick={() => controls.step.mutate(1)} disabled={busy || atEnd}>
        <StepForward className="size-4" />
      </IconButton>
      <IconButton label="Advance 24 hours" onClick={() => controls.step.mutate(24)} disabled={busy || atEnd}>
        <FastForward className="size-4" />
      </IconButton>
      <IconButton label="Reset to simulation start" onClick={() => controls.reset.mutate()} disabled={busy}>
        <RotateCcw className="size-4" />
      </IconButton>
    </div>
  );
}
