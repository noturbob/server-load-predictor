"use client";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { COLORS, TooltipBox } from "@/components/charts/chart-parts";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import type { SparkPoint } from "@/lib/types";

/** 24h of actual CPU followed by the next 24h forecast. */
export function Sparkline({ points, now, height = 64 }: { points: SparkPoint[]; now?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis dataKey="ts" hide />
          <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
          <Tooltip
            cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SparkPoint;
              const isForecast = p.actual === null;
              const value = p.actual ?? p.forecast ?? 0;
              return (
                <TooltipBox
                  title={fmtDateTime(p.ts)}
                  rows={[
                    {
                      label: isForecast ? "Forecast CPU" : "Actual CPU",
                      value: `${fmtNumber(value)} units`,
                      color: isForecast ? COLORS.forecast : COLORS.actual,
                      kind: isForecast ? "dashed" : "line",
                    },
                  ]}
                />
              );
            }}
          />
          {now && <ReferenceLine x={now} stroke={COLORS.axis} />}
          <Line dataKey="actual" stroke={COLORS.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line
            dataKey="forecast"
            stroke={COLORS.forecast}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
