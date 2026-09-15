"use client";

import { cn } from "@/lib/utils";

/** Series roles → CSS color tokens (validated categorical order; see globals.css). */
export const COLORS = {
  actual: "var(--chart-1)",
  forecast: "var(--chart-2)",
  shortTerm: "var(--chart-3)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  muted: "var(--chart-muted)",
  ink: "var(--chart-ink)",
  band: "var(--chart-band)",
  wash: "var(--chart-wash)",
} as const;

export const axisProps = {
  stroke: COLORS.axis,
  tick: { fill: COLORS.muted, fontSize: 10.5, fontFamily: "var(--font-plex-mono)" },
  tickLine: false,
  axisLine: { stroke: COLORS.axis },
} as const;

export const HOUR = 3_600_000;

/** Y-axis ticks: comma'd whole numbers, compacted only when large. */
export const fmtAxis = (v: number) =>
  Math.abs(v) >= 10_000 ? v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 }) : v.toLocaleString("en-US");

/** Tick positions at midnight (or every `stepHours`) across a time domain. */
export function timeTicks(start: number, end: number, stepHours: number): number[] {
  const step = stepHours * HOUR;
  const first = Math.ceil(start / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= end; t += step) ticks.push(t);
  return ticks;
}

export type LegendItem = { label: string; color: string; kind?: "line" | "dashed" | "area" | "bar" | "step" };

export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <Swatch color={item.color} kind={item.kind ?? "line"} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Swatch({ color, kind }: { color: string; kind: NonNullable<LegendItem["kind"]> }) {
  if (kind === "area") {
    return <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: color === COLORS.forecast ? COLORS.band : color, opacity: color === COLORS.forecast ? 1 : 0.25 }} />;
  }
  if (kind === "bar") {
    return <span className="inline-block size-2.5 rounded-sm" style={{ background: color }} />;
  }
  return (
    <svg width="18" height="8" aria-hidden>
      <line
        x1="1"
        x2="17"
        y1="4"
        y2="4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={kind === "dashed" ? "4 3" : undefined}
      />
    </svg>
  );
}

export type TooltipRow = { label: string; value: string; color?: string; kind?: LegendItem["kind"] };

export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-48 rounded-md border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]">
      <div className="eyebrow mb-2">{title}</div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && <Swatch color={r.color} kind={r.kind ?? "line"} />}
              {r.label}
            </span>
            <span className="tabular font-medium">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
