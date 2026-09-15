import { AlertTriangle, CheckCircle2, Coins, TrendingUp } from "lucide-react";

import { STATUS_LABELS } from "@/lib/format";
import type { Status } from "@/lib/types";
import { cn } from "@/lib/utils";

// Status colors are reserved for state and always paired with an icon + label.
const STYLES: Record<Status, { icon: typeof CheckCircle2; dot: string }> = {
  healthy: { icon: CheckCircle2, dot: "text-status-good" },
  over_provisioned: { icon: Coins, dot: "text-status-warning" },
  scale_up_soon: { icon: TrendingUp, dot: "text-status-serious" },
  at_risk: { icon: AlertTriangle, dot: "text-status-critical" },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { icon: Icon, dot } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <Icon className={cn("size-3.5", dot)} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
