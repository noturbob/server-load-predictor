"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { COLORS, ChartLegend, TooltipBox, axisProps, fmtAxis, timeTicks, type TooltipRow } from "@/components/charts/chart-parts";
import { fmtDateTime, fmtNumber, fmtShortDay, fmtTime } from "@/lib/format";
import type { HistoryPoint } from "@/lib/types";

type Row = { t: number; actual: number; pred_1h: number | null; pred_24h: number | null; band: [number, number] | null };

/** What actually happened vs. what the model predicted 1h and 24h earlier. */
export function AccuracyChart({ points, unit, height = 240 }: { points: HistoryPoint[]; unit: string; height?: number }) {
  const data = useMemo<Row[]>(
    () =>
      points.map((p) => ({
        t: new Date(p.ts).getTime(),
        actual: p.actual,
        pred_1h: p.pred_1h,
        pred_24h: p.pred_24h,
        band: p.p10_24h !== null && p.p90_24h !== null ? [p.p10_24h, p.p90_24h] : null,
      })),
    [points],
  );
  const start = data[0]?.t ?? 0;
  const end = data.at(-1)?.t ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: "Actual", color: COLORS.actual },
          { label: "Predicted 24h earlier", color: COLORS.forecast, kind: "dashed" },
          { label: "Predicted 1h earlier", color: COLORS.shortTerm },
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              ticks={timeTicks(start, end, 12)}
              tickFormatter={(t: number) => (new Date(t).getUTCHours() === 0 ? fmtShortDay(t) : fmtTime(t))}
              {...axisProps}
            />
            <YAxis tickFormatter={fmtAxis} width={48} {...axisProps} axisLine={false} />
            <Tooltip
              cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                const rows: TooltipRow[] = [{ label: "Actual", value: `${fmtNumber(row.actual)} ${unit}`, color: COLORS.actual }];
                if (row.pred_24h !== null)
                  rows.push({ label: "24h-ahead", value: `${fmtNumber(row.pred_24h)} (${signed(row.pred_24h - row.actual)})`, color: COLORS.forecast, kind: "dashed" });
                if (row.pred_1h !== null)
                  rows.push({ label: "1h-ahead", value: `${fmtNumber(row.pred_1h)} (${signed(row.pred_1h - row.actual)})`, color: COLORS.shortTerm });
                return <TooltipBox title={fmtDateTime(label as number)} rows={rows} />;
              }}
            />
            <Area dataKey="band" stroke="none" fill={COLORS.forecast} fillOpacity={0.1} isAnimationActive={false} />
            <Line dataKey="actual" stroke={COLORS.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="pred_24h" stroke={COLORS.forecast} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="pred_1h" stroke={COLORS.shortTerm} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function signed(n: number) {
  return `${n >= 0 ? "+" : "−"}${fmtNumber(Math.abs(n))}`;
}
