"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  COLORS,
  ChartLegend,
  HOUR,
  TooltipBox,
  axisProps,
  fmtAxis,
  timeTicks,
  type TooltipRow,
} from "@/components/charts/chart-parts";
import { fmtDateTime, fmtNumber, fmtShortDay, fmtTime } from "@/lib/format";
import type { ForecastPoint, UsagePoint } from "@/lib/types";

type Row = { t: number; actual?: number; p50?: number; band?: [number, number] };

export function ForecastChart({
  usage,
  forecast,
  now,
  unit,
  capacity,
  height = 320,
}: {
  usage: UsagePoint[];
  forecast: ForecastPoint[];
  now: string;
  unit: string;
  capacity?: { value: number; label: string };
  height?: number;
}) {
  const nowMs = new Date(now).getTime();

  const data = useMemo<Row[]>(() => {
    const rows: Row[] = usage.map((p) => ({ t: new Date(p.ts).getTime(), actual: p.value }));
    const last = rows.at(-1);
    if (last && last.actual !== undefined) {
      last.p50 = last.actual; // join the forecast line to the last actual
      last.band = [last.actual, last.actual];
    }
    for (const p of forecast) {
      rows.push({ t: new Date(p.ts).getTime(), p50: p.p50, band: [p.p10, p.p90] });
    }
    return rows;
  }, [usage, forecast]);

  const start = data[0]?.t ?? nowMs;
  const end = data.at(-1)?.t ?? nowMs;
  const spanHours = (end - start) / HOUR;
  const ticks = timeTicks(start, end, spanHours > 72 ? 24 : spanHours > 36 ? 12 : 6);
  const tickFormatter = (t: number) =>
    spanHours > 72 || new Date(t).getUTCHours() === 0 ? fmtShortDay(t) : fmtTime(t);

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: "Actual", color: COLORS.actual },
          { label: "Forecast (median)", color: COLORS.forecast, kind: "dashed" },
          { label: "80% forecast range", color: COLORS.forecast, kind: "area" },
          ...(capacity ? [{ label: capacity.label, color: COLORS.muted, kind: "dashed" as const }] : []),
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              ticks={ticks}
              tickFormatter={tickFormatter}
              {...axisProps}
            />
            <YAxis tickFormatter={fmtAxis} width={48} {...axisProps} axisLine={false} />
            <Tooltip
              cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                const rows: TooltipRow[] = [];
                if (row.actual !== undefined) rows.push({ label: "Actual", value: `${fmtNumber(row.actual)} ${unit}`, color: COLORS.actual });
                if (row.p50 !== undefined && row.t > nowMs) {
                  rows.push({ label: "Forecast", value: `${fmtNumber(row.p50)} ${unit}`, color: COLORS.forecast, kind: "dashed" });
                  if (row.band) rows.push({ label: "80% range", value: `${fmtNumber(row.band[0])}–${fmtNumber(row.band[1])}`, color: COLORS.forecast, kind: "area" });
                }
                if (capacity) rows.push({ label: "Capacity", value: `${fmtNumber(capacity.value)} ${unit}`, color: COLORS.muted, kind: "dashed" });
                return <TooltipBox title={fmtDateTime(label as number)} rows={rows} />;
              }}
            />
            <Area
              dataKey="band"
              stroke="none"
              fill={COLORS.forecast}
              fillOpacity={0.14}
              isAnimationActive={false}
              connectNulls
            />
            {capacity && (
              <ReferenceLine
                y={capacity.value}
                stroke={COLORS.muted}
                strokeDasharray="6 4"
                ifOverflow="extendDomain"
                label={{ value: "Capacity", position: "insideTopLeft", fill: COLORS.muted, fontSize: 11 }}
              />
            )}
            <ReferenceLine
              x={nowMs}
              stroke={COLORS.axis}
              label={{ value: "Now", position: "top", fill: COLORS.muted, fontSize: 11 }}
            />
            <Line dataKey="actual" stroke={COLORS.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              dataKey="p50"
              stroke={COLORS.forecast}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
