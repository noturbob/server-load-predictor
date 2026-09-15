"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { COLORS, ChartLegend, TooltipBox, axisProps, fmtAxis } from "@/components/charts/chart-parts";
import { MODEL_LABELS, fmtNumber } from "@/lib/format";

// Fixed order → fixed colors, independent of which model wins.
export const MODEL_ORDER = ["seasonal_naive", "holt_winters", "lightgbm"] as const;
const MODEL_COLORS: Record<string, string> = {
  seasonal_naive: "var(--chart-1)",
  holt_winters: "var(--chart-2)",
  lightgbm: "var(--chart-3)",
};

export type MaeRow = { cluster: string } & Partial<Record<(typeof MODEL_ORDER)[number], number>>;

export function ModelMaeChart({ data, unit, height = 260 }: { data: MaeRow[]; unit: string; height?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <ChartLegend items={MODEL_ORDER.map((m) => ({ label: MODEL_LABELS[m], color: MODEL_COLORS[m], kind: "bar" }))} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="cluster" {...axisProps} />
            <YAxis tickFormatter={fmtAxis} width={44} {...axisProps} axisLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as MaeRow;
                return (
                  <TooltipBox
                    title={`${label} · mean absolute error`}
                    rows={MODEL_ORDER.filter((m) => row[m] !== undefined).map((m) => ({
                      label: MODEL_LABELS[m],
                      value: `${fmtNumber(row[m]!, 1)} ${unit}`,
                      color: MODEL_COLORS[m],
                      kind: "bar" as const,
                    }))}
                  />
                );
              }}
            />
            {MODEL_ORDER.map((m) => (
              <Bar key={m} dataKey={m} fill={MODEL_COLORS[m]} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
