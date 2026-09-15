"use client";

import { FastForward, Pause, Play, RotateCcw, StepForward } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSimulation, useSimulationControls } from "@/hooks/use-api";
import { cn } from "@/lib/utils";

const clock = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function Control({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
            active && "text-brand hover:text-brand",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The simulated clock, styled like an instrument readout. */
export function SimControls() {
  const { data: sim, isError } = useSimulation();
  const controls = useSimulationControls();
  const busy = controls.step.isPending || controls.reset.isPending;

  if (isError || !sim) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border bg-card px-3">
        <span className={cn("size-1.5 rounded-full", isError ? "bg-status-critical" : "bg-muted-foreground")} />
        <span className="eyebrow">{isError ? "API offline" : "Connecting"}</span>
      </div>
    );
  }

  const atEnd = sim.progress >= 1;
  const parts = clock.formatToParts(new Date(sim.now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  return (
    <div className="flex h-9 items-stretch overflow-hidden rounded-md border bg-card">
      <div className="relative hidden items-center gap-2.5 border-r px-3 md:flex">
        <span className="relative flex size-1.5">
          {sim.running && <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />}
          <span className={cn("relative inline-flex size-1.5 rounded-full", sim.running ? "bg-brand" : "bg-muted-foreground/50")} />
        </span>
        <span className="font-mono text-[12.5px] tracking-tight whitespace-nowrap tabular">
          <span className="text-muted-foreground">
            {get("weekday")} {get("day")} {get("month")}
          </span>{" "}
          {get("hour")}:{get("minute")}
          <span className="ml-1 text-[10px] text-muted-foreground">UTC</span>
        </span>
        <span className="absolute inset-x-0 bottom-0 h-px bg-rule">
          <span className="block h-full bg-brand transition-[width] duration-500" style={{ width: `${sim.progress * 100}%` }} />
        </span>
      </div>
      <div className="flex items-center divide-x">
        {sim.running ? (
          <Control label="Pause simulation" onClick={() => controls.pause.mutate()} active>
            <Pause className="size-3.5 fill-current" />
          </Control>
        ) : (
          <Control label={`Play · 1 hour every ${sim.tick_seconds}s`} onClick={() => controls.play.mutate()} disabled={atEnd}>
            <Play className="size-3.5 fill-current" />
          </Control>
        )}
        <Control label="Advance 1 hour" onClick={() => controls.step.mutate(1)} disabled={busy || atEnd}>
          <StepForward className="size-3.5" />
        </Control>
        <Control label="Advance 24 hours" onClick={() => controls.step.mutate(24)} disabled={busy || atEnd}>
          <FastForward className="size-3.5" />
        </Control>
        <Control label="Reset to simulation start" onClick={() => controls.reset.mutate()} disabled={busy}>
          <RotateCcw className="size-3.5" />
        </Control>
      </div>
    </div>
  );
}
