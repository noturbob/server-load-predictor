"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { COLORS, ChartLegend, TooltipBox, axisProps, fmtAxis, timeTicks, type TooltipRow } from "@/components/charts/chart-parts";
import type { SnapshotCluster } from "@/content/snapshot";
import { fmtDateTime, fmtNumber, fmtShortDay } from "@/lib/format";

type Row = { t: number; actual?: number; p50?: number; band?: [number, number]; capacity?: number; servers?: number };

/** Past load, the forecast with its range, and the stepped server plan riding above it. */
export function HeroChart({ data, now, hours = 72, height = 360 }: { data: SnapshotCluster; now: string; hours?: number; height?: number }) {
  const nowMs = new Date(now).getTime();
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = data.usage.map((p) => ({ t: new Date(p.ts).getTime(), actual: p.value }));
    const last = out.at(-1);
    const firstPlan = data.plan[0];
    if (last?.actual !== undefined) {
      last.p50 = last.actual;
      last.band = [last.actual, last.actual];
      if (firstPlan) {
        last.capacity = firstPlan.servers * data.capacity_per_server;
        last.servers = firstPlan.servers;
      }
    }
    data.forecast.slice(0, hours).forEach((f, i) => {
      const plan = data.plan[i];
      out.push({
        t: new Date(f.ts).getTime(),
        p50: f.p50,
        band: [f.p10, f.p90],
        capacity: plan ? plan.servers * data.capacity_per_server : undefined,
        servers: plan?.servers,
      });
    });
    return out;
  }, [data, hours]);

  const start = rows[0]?.t ?? nowMs;
  const end = rows.at(-1)?.t ?? nowMs;

  return (
    <div className="flex flex-col gap-4">
      <ChartLegend
        items={[
          { label: "Actual load", color: COLORS.actual },
          { label: "Forecast", color: COLORS.forecast, kind: "dashed" },
          { label: "80% range", color: COLORS.forecast, kind: "area" },
          { label: "Server plan (capacity at target)", color: COLORS.ink },
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 20, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="t" type="number" scale="time" domain={[start, end]} ticks={timeTicks(start, end, 24)} tickFormatter={fmtShortDay} {...axisProps} />
            <YAxis tickFormatter={fmtAxis} width={44} {...axisProps} axisLine={false} />
            <Tooltip
              cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Row;
                const items: TooltipRow[] = [];
                if (r.actual !== undefined) items.push({ label: "Actual", value: `${fmtNumber(r.actual)} units`, color: COLORS.actual });
                if (r.p50 !== undefined && r.t > nowMs) {
                  items.push({ label: "Forecast", value: `${fmtNumber(r.p50)} units`, color: COLORS.forecast, kind: "dashed" });
                  if (r.band) items.push({ label: "80% range", value: `${fmtNumber(r.band[0])}–${fmtNumber(r.band[1])}`, color: COLORS.forecast, kind: "area" });
                }
                if (r.servers !== undefined) items.push({ label: "Plan", value: `${r.servers} servers`, color: COLORS.ink });
                return <TooltipBox title={fmtDateTime(label as number)} rows={items} />;
              }}
            />
            <Area dataKey="band" stroke="none" fill={COLORS.band} isAnimationActive={false} />
            <ReferenceLine
              x={nowMs}
              stroke={COLORS.axis}
              label={{ value: "NOW", position: "top", fill: COLORS.ink, fontSize: 10, fontFamily: "var(--font-plex-mono)", letterSpacing: 1.2 }}
            />
            <Line type="stepAfter" dataKey="capacity" stroke={COLORS.ink} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="actual" stroke={COLORS.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="p50" stroke={COLORS.forecast} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type SizingRow = { t: number; load: number; plan: number; peak: number; waste: [number, number] };

/** A week of forecast load: capacity sized for the peak vs. capacity that follows the forecast. */
export function SizingChart({ data, peakServers, height = 280 }: { data: SnapshotCluster; peakServers: number; height?: number }) {
  const rows = useMemo<SizingRow[]>(() => {
    const peak = peakServers * data.capacity_per_server;
    return data.forecast.map((f, i) => {
      const plan = (data.plan[i]?.servers ?? peakServers) * data.capacity_per_server;
      return { t: new Date(f.ts).getTime(), load: f.p90, plan, peak, waste: [plan, peak] };
    });
  }, [data, peakServers]);
  const start = rows[0]?.t ?? 0;
  const end = rows.at(-1)?.t ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <ChartLegend
        items={[
          { label: "Forecast load (p90)", color: COLORS.forecast },
          { label: "Sized for the peak", color: COLORS.muted, kind: "dashed" },
          { label: "Forecast plan", color: COLORS.ink },
          { label: "Idle capacity avoided", color: COLORS.muted, kind: "area" },
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="t" type="number" scale="time" domain={[start, end]} ticks={timeTicks(start, end, 24)} tickFormatter={fmtShortDay} {...axisProps} />
            <YAxis tickFormatter={fmtAxis} width={44} {...axisProps} axisLine={false} />
            <Tooltip
              cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as SizingRow;
                return (
                  <TooltipBox
                    title={fmtDateTime(label as number)}
                    rows={[
                      { label: "Load (p90)", value: `${fmtNumber(r.load)} units`, color: COLORS.forecast },
                      { label: "Peak sizing", value: `${fmtNumber(r.peak)} units`, color: COLORS.muted, kind: "dashed" },
                      { label: "Plan", value: `${fmtNumber(r.plan)} units`, color: COLORS.ink },
                    ]}
                  />
                );
              }}
            />
            <Area type="stepAfter" dataKey="waste" stroke="none" fill={COLORS.muted} fillOpacity={0.14} isAnimationActive={false} />
            <Line dataKey="peak" stroke={COLORS.muted} strokeWidth={1.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="plan" stroke={COLORS.ink} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="load" stroke={COLORS.forecast} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Axis-free 48h forecast band with the peak hour marked, for the "Forecast" step. */
export function ForecastMini({ data, peakTs, height = 110 }: { data: SnapshotCluster; peakTs: string; height?: number }) {
  const rows = useMemo(
    () => data.forecast.slice(0, 48).map((f) => ({ t: new Date(f.ts).getTime(), p50: f.p50, band: [f.p10, f.p90] as [number, number] })),
    [data],
  );
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 4, left: 4 }}>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis hide domain={["dataMin - 40", "dataMax + 40"]} />
          <Area dataKey="band" stroke="none" fill={COLORS.band} isAnimationActive={false} />
          <ReferenceLine x={new Date(peakTs).getTime()} stroke={COLORS.axis} />
          <Line dataKey="p50" stroke={COLORS.forecast} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
