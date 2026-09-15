"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { COLORS, ChartLegend, HOUR, TooltipBox, axisProps, timeTicks } from "@/components/charts/chart-parts";
import { fmtDateTime, fmtShortDay, fmtTime } from "@/lib/format";
import type { PlanPoint } from "@/lib/types";

type Row = { t: number; servers: number; required: number };

export function ServerPlanChart({
  plan,
  current,
  height = 220,
}: {
  plan: PlanPoint[];
  current: number;
  height?: number;
}) {
  const data = useMemo<Row[]>(
    () => plan.map((p) => ({ t: new Date(p.ts).getTime(), servers: p.servers, required: p.required })),
    [plan],
  );
  const start = data[0]?.t ?? 0;
  const end = data.at(-1)?.t ?? 0;
  const spanHours = (end - start) / HOUR;
  const maxY = Math.max(current, ...data.map((d) => Math.max(d.servers, d.required)));

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: "Recommended servers", color: COLORS.ink },
          { label: "Required by p90 forecast", color: COLORS.forecast },
          { label: `Running now (${current})`, color: COLORS.muted, kind: "dashed" },
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              ticks={timeTicks(start, end, spanHours > 72 ? 24 : 6)}
              tickFormatter={(t: number) =>
                spanHours > 72 || new Date(t).getUTCHours() === 0 ? fmtShortDay(t) : fmtTime(t)
              }
              {...axisProps}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, Math.ceil(maxY * 1.15)]}
              width={36}
              {...axisProps}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                return (
                  <TooltipBox
                    title={fmtDateTime(label as number)}
                    rows={[
                      { label: "Recommended", value: String(row.servers), color: COLORS.ink },
                      { label: "Required", value: String(row.required), color: COLORS.forecast },
                      { label: "Running now", value: String(current), color: COLORS.muted, kind: "dashed" },
                    ]}
                  />
                );
              }}
            />
            <ReferenceLine y={current} stroke={COLORS.muted} strokeDasharray="6 4" />
            <Line type="stepAfter" dataKey="required" stroke={COLORS.forecast} strokeWidth={1.5} strokeOpacity={0.8} dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="servers" stroke={COLORS.ink} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
