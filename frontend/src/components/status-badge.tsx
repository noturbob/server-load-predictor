import { AlertTriangle, CheckCircle2, CircleDollarSign, TrendingUp } from "lucide-react";

import { STATUS_LABELS } from "@/lib/format";
import type { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

// Status colors are reserved for state and always paired with an icon + label.
const STYLES: Record<Status, { icon: typeof CheckCircle2; tone: string }> = {
  healthy: { icon: CheckCircle2, tone: "text-status-good" },
  over_provisioned: { icon: CircleDollarSign, tone: "text-muted-foreground" },
  scale_up_soon: { icon: TrendingUp, tone: "text-status-warning" },
  at_risk: { icon: AlertTriangle, tone: "text-status-critical" },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { icon: Icon, tone } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border bg-card pr-2.5 pl-2 font-mono text-[10.5px] tracking-[0.08em] whitespace-nowrap uppercase",
        className,
      )}
    >
      <Icon className={cn("size-3.5", tone)} aria-hidden />
      <span className="text-foreground">{STATUS_LABELS[status]}</span>
    </span>
  );
}
