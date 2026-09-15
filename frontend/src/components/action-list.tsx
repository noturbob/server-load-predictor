import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/state";
import { fmtDayHour, hoursFromNow } from "@/lib/format";
import type { ScaleAction } from "@/lib/types";
import { cn } from "@/lib/utils";

const URGENCY: Record<ScaleAction["urgency"], { label: string; className: string }> = {
  critical: { label: "Act now", className: "text-status-critical" },
  high: { label: "Within 6h", className: "text-status-serious" },
  medium: { label: "Today", className: "text-foreground" },
  low: { label: "Planned", className: "text-muted-foreground" },
};

export function actionTitle(a: ScaleAction) {
  const n = Math.abs(a.delta);
  const noun = n === 1 ? "server" : "servers";
  return a.direction === "up" ? `Add ${n} ${noun}` : `Remove ${n} ${noun}`;
}

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
    return <EmptyState>No scaling needed in this window — the fleet is right-sized.</EmptyState>;
  }
  return (
    <ul className="divide-y">
      {items.map((a, i) => {
        const up = a.direction === "up";
        const Icon = up ? ArrowUpRight : ArrowDownRight;
        const urgency = URGENCY[a.urgency];
        return (
          <li key={`${a.clusterId ?? ""}-${a.at}-${i}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
                up ? "text-status-serious" : "text-status-good",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">
                  {actionTitle(a)} {up ? "by" : "at"} {fmtDayHour(a.at)}
                </span>
                {showCluster && a.clusterId && (
                  <Link href={`/clusters/${a.clusterId}`} className="text-sm text-muted-foreground hover:underline">
                    {a.clusterName}
                  </Link>
                )}
              </div>
              <div className="tabular text-xs text-muted-foreground">
                {a.from_servers} → {a.to_servers} servers · {hoursFromNow(a.at, now)} ·{" "}
                <span className={urgency.className}>{urgency.label}</span>
              </div>
              {!compact && <p className="mt-1 text-sm text-muted-foreground">{a.reason}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
