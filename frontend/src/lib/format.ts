import type { Metric, Status } from "@/lib/types";

// All simulation timestamps are UTC; display them in UTC so they match the backend's reasoning text.
const dateTime = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const dayHour = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const shortDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));

export const fmtDateTime = (v: string | number | Date) => `${dateTime.format(toDate(v))} UTC`;
export const fmtDayHour = (v: string | number | Date) => dayHour.format(toDate(v));
export const fmtShortDay = (v: string | number | Date) => shortDay.format(toDate(v));
export const fmtFullDate = (v: string | number | Date) => fullDate.format(toDate(v));
export const fmtTime = (v: string | number | Date) => time.format(toDate(v));

export const fmtNumber = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtCompact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const fmtCurrency = (n: number, digits = 0) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

export const fmtPercent = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export function hoursFromNow(ts: string, now: string): string {
  const h = Math.round((new Date(ts).getTime() - new Date(now).getTime()) / 3_600_000);
  if (h <= 0) return "now";
  if (h < 24) return `in ${h}h`;
  const d = Math.floor(h / 24);
  const rest = h % 24;
  return rest ? `in ${d}d ${rest}h` : `in ${d}d`;
}

export const METRIC_LABELS: Record<Metric, { label: string; unit: string; short: string }> = {
  cpu: { label: "CPU", unit: "load units", short: "units" },
  memory: { label: "Memory", unit: "GB", short: "GB" },
  network: { label: "Network", unit: "Mbps", short: "Mbps" },
};

export const MODEL_LABELS: Record<string, string> = {
  lightgbm: "LightGBM (quantile)",
  seasonal_naive: "Seasonal naive",
  holt_winters: "Holt-Winters",
};

export const STATUS_LABELS: Record<Status, string> = {
  healthy: "Healthy",
  scale_up_soon: "Scale up soon",
  over_provisioned: "Over-provisioned",
  at_risk: "At risk",
};
