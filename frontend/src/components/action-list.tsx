import { Minus, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/state";
import { fmtTime, hoursFromNow } from "@/lib/format";
import type { ScaleAction } from "@/lib/types";
import { cn } from "@/lib/utils";

const URGENCY: Record<ScaleAction["urgency"], { label: string; className: string }> = {
  critical: { label: "Act now", className: "text-status-critical" },
  high: { label: "Within 6h", className: "text-status-warning" },
  medium: { label: "Today", className: "text-foreground" },
  low: { label: "Planned", className: "text-muted-foreground" },
};

const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

export function actionTitle(a: ScaleAction) {
  const n = Math.abs(a.delta);
  return `${a.direction === "up" ? "Add" : "Remove"} ${n} ${n === 1 ? "server" : "servers"}`;
}

/** A vertical timeline of scaling steps. */
export function ActionList({
  actions,
  now,
  showCluster,
  limit,
  compact,
}: {
  actions: (ScaleAction & { clusterId?: string; clusterName?: string })[];
  now: string;
  showCluster?: boolean;
  limit?: number;
  compact?: boolean;
}) {
  const items = limit ? actions.slice(0, limit) : actions;
  if (!items.length) {
    return <EmptyState>No scaling needed in this window. The fleet is right-sized.</EmptyState>;
  }
  return (
    <ol className="relative">
      {items.map((a, i) => {
        const up = a.direction === "up";
        const urgency = URGENCY[a.urgency];
        const last = i === items.length - 1;
        return (
          <li key={`${a.clusterId ?? ""}-${a.at}-${i}`} className="grid grid-cols-[52px_20px_1fr] gap-x-3">
            <div className="pt-0.5 text-right font-mono leading-tight">
              <div className="text-[13px] tabular">{fmtTime(a.at)}</div>
              <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{day.format(new Date(a.at))}</div>
            </div>
            <div className="relative flex justify-center">
              {!last && <span className="absolute top-6 bottom-0 w-px bg-border" />}
              <span
                className={cn(
                  "relative mt-0.5 flex size-5 items-center justify-center rounded-full border-[1.5px] bg-card",
                  up ? "border-brand text-brand" : "border-foreground/70 text-foreground/80",
                )}
              >
                {up ? <Plus className="size-3" strokeWidth={2.5} /> : <Minus className="size-3" strokeWidth={2.5} />}
              </span>
            </div>
            <div className={cn("min-w-0", last ? "pb-0" : "pb-5")}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{actionTitle(a)}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular">
                  {a.from_servers}→{a.to_servers}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] tracking-wide uppercase">
                <span className={urgency.className}>{urgency.label}</span>
                <span className="text-muted-foreground">· {hoursFromNow(a.at, now)}</span>
                {showCluster && a.clusterId && (
                  <Link href={`/clusters/${a.clusterId}`} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    · {a.clusterName}
                  </Link>
                )}
              </div>
              {!compact && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{a.reason}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
