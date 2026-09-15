import { ArrowRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ActionList } from "@/components/action-list";
import { CapacityMeter } from "@/components/capacity-meter";
import { CopyCommand } from "@/components/landing/copy-command";
import { GithubIcon } from "@/components/landing/github-icon";
import { ForecastMini, HeroChart, SizingChart } from "@/components/landing/hero-chart";
import { LandingHeader } from "@/components/landing/landing-header";
import { LogoMark } from "@/components/logo";
import { Panel, Readout } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { GITHUB_URL, snapshot } from "@/content/snapshot";
import { MODEL_LABELS, fmtCurrency, fmtDayHour, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODEL_ORDER = ["lightgbm", "seasonal_naive", "holt_winters"];

export default function LandingPage() {
  const s = snapshot;
  const hero = s.clusters[s.hero_cluster];
  const heroFleet = s.fleet.find((f) => f.id === s.hero_cluster)!;
  const batch = s.fleet.find((f) => f.id === s.actions_cluster)!;
  const batchDetail = s.clusters[s.actions_cluster];
  const weeklySavings = s.fleet.reduce((sum, f) => sum + f.savings_7d, 0);
  const peakPoint = hero.forecast.slice(0, 72).reduce((best, p) => (p.p50 > best.p50 ? p : best), hero.forecast[0]);
  const batchLoad = batchDetail.usage.at(-1)?.value ?? 0;
  const batchUtilization = Math.round((batchLoad / (batch.current_servers * (batchDetail.capacity_per_server / batchDetail.target_utilization))) * 100);
  const peakSizingSavingsPct = Math.round((1 - heroFleet.planned_cost_7d / heroFleet.static_peak_cost_7d) * 100);

  return (
    <>
      <LandingHeader />
      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-[1200px] px-4 pt-16 pb-20 sm:px-8 sm:pt-24">
          <div className="max-w-3xl">
            <div className="eyebrow flex flex-wrap items-center gap-2">
              <span className="text-brand">Open source</span>
              <span>/</span>
              <span>Capacity forecasting for server fleets</span>
            </div>
            <h1 className="mt-5 text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-[68px]">
              Scale servers <span className="text-brand">before</span> the traffic arrives.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Load Predictor forecasts CPU, memory and network load a week ahead, then tells you exactly when to add or remove servers,
              and why. Think of it as a weather forecast for your infrastructure.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="flex h-11 items-center gap-2 rounded-md bg-foreground px-5 text-[15px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Open the dashboard <ArrowRight className="size-4" />
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center gap-2 rounded-md border bg-card px-5 text-[15px] font-medium transition-colors hover:border-foreground/30"
              >
                <GithubIcon className="size-4" /> View on GitHub
              </a>
            </div>
          </div>

          <Panel className="mt-14 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{heroFleet.name}</span>
                <StatusBadge status={heroFleet.status} />
              </div>
              <span className="eyebrow">CPU · last 3 days → next 3 days · real model output</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b px-5 py-5 sm:px-6 md:grid-cols-4">
              <Readout size="md" label="Load now" value={`${fmtNumber(hero.usage.at(-1)?.value ?? 0)}`} hint="CPU load units" />
              <Readout size="md" label="Forecast peak" value={fmtNumber(peakPoint.p50)} hint={`${fmtDayHour(peakPoint.ts)} UTC`} />
              <Readout
                size="md"
                label="Servers"
                value={
                  <span className="tabular">
                    {heroFleet.current_servers}
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    {heroFleet.recommended_servers}
                  </span>
                }
                hint={`peaks at ${heroFleet.peak_servers} this week`}
              />
              <Readout size="md" label="Saved · next 7 days" value={fmtCurrency(heroFleet.savings_7d)} hint="vs. running flat" />
            </div>
            <div className="px-3 pt-5 pb-4 sm:px-6">
              <HeroChart data={hero} now={s.now} />
            </div>
          </Panel>
        </section>

        {/* ── 01 Problem ───────────────────────────────────── */}
        <Section id="problem" index="01" eyebrow="The problem" title="Autoscaling reacts. By then it's already late.">
          <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            Traffic has a rhythm: weekday peaks, quiet nights, month-end batch jobs. Most fleets either size for the worst hour and pay
            for idle machines all week, or scale after load arrives and hope new servers boot in time.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div className="grid gap-6">
              <Panel className="p-6">
                <div className="eyebrow">Too many servers</div>
                <div className="mt-3 text-[34px] leading-none font-medium tracking-[-0.02em]">
                  {fmtCurrency(heroFleet.static_peak_cost_7d)}
                  <span className="ml-2 text-base text-muted-foreground">/ week</span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                  Sizing {heroFleet.name} for its weekly peak. Following the forecast costs {fmtCurrency(heroFleet.planned_cost_7d)}, or{" "}
                  <span className="font-medium text-foreground">{peakSizingSavingsPct}% less</span>.
                </p>
              </Panel>
              <Panel className="p-6">
                <div className="eyebrow">Too few servers</div>
                <div className="mt-3 text-[34px] leading-none font-medium tracking-[-0.02em]">
                  {batch.current_servers} <span className="text-muted-foreground">of</span> {batch.recommended_servers}
                  <span className="ml-2 text-base text-muted-foreground">needed</span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                  {batch.name} is at {batchUtilization}% of running capacity as its nightly jobs start. A reactive autoscaler adds servers only
                  after that happens, and they still need time to boot.
                </p>
              </Panel>
            </div>
            <Panel className="px-3 pt-5 pb-4 sm:px-6">
              <div className="mb-4 px-2 sm:px-0">
                <div className="text-[15px] font-semibold tracking-tight">Peak sizing vs. forecast plan</div>
                <p className="mt-1 text-[13px] text-muted-foreground">{heroFleet.name}, next 7 days. The shaded area is capacity you no longer pay for.</p>
              </div>
              <SizingChart data={hero} peakServers={heroFleet.peak_servers} height={290} />
            </Panel>
          </div>
        </Section>

        {/* ── 02 How it works ──────────────────────────────── */}
        <Section id="how" index="02" eyebrow="How it works" title="Forecast. Plan. Act.">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Step
              n="1"
              title="Forecast every hour of the next week"
              body="LightGBM quantile models learn daily and weekly rhythm, growth and seasonality from lag features. Each hour gets a median and an 80% range, calibrated so the range means what it says."
            >
              <ForecastMini data={hero} peakTs={peakPoint.ts} />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {(["p10", "p50", "p90"] as const).map((q) => (
                  <div key={q} className="rounded-md border bg-surface-2 px-3 py-2.5">
                    <div className="eyebrow">{q === "p50" ? "median" : q}</div>
                    <div className="mt-1.5 font-mono text-[15px] tabular">{fmtNumber(peakPoint[q])}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
                Next 48h · peak hour {fmtDayHour(peakPoint.ts)} UTC · CPU units
              </p>
            </Step>
            <Step
              n="2"
              title="Size the fleet ahead of demand"
              body="Servers are sized so the p90 forecast stays under a target utilization, started early enough to boot, and removed only once load has stayed low. No flapping."
            >
              <div className="flex flex-col gap-5">
                {[batch, heroFleet].map((f) => (
                  <div key={f.id}>
                    <div className="mb-2 flex items-baseline justify-between text-[13px]">
                      <span className="font-medium">{f.name}</span>
                      <span className="font-mono tabular text-muted-foreground">
                        {f.current_servers} → {f.recommended_servers}
                      </span>
                    </div>
                    <CapacityMeter current={f.current_servers} recommended={f.recommended_servers} />
                  </div>
                ))}
              </div>
            </Step>
            <Step
              n="3"
              title="Act on dated, explained steps"
              body="Every change in the plan becomes an action with a time, an urgency and the forecast that justifies it. Apply it, or push it to your autoscaler."
            >
              <ActionList actions={batchDetail.actions.slice(0, 2)} now={s.now} />
            </Step>
          </div>
        </Section>

        {/* ── 03 Results ───────────────────────────────────── */}
        <Section id="results" index="03" eyebrow="Results" title="Measured, not promised.">
          <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            Every model is backtested from a fresh origin each day over three weeks of held-out data, forecasting 1–168 hours ahead.
            Numbers below are from the included demo dataset.
          </p>
          <Panel className="mt-10 grid grid-cols-2 md:grid-cols-4 md:divide-x max-md:[&>*:nth-child(-n+2)]:border-b max-md:[&>*:nth-child(odd)]:border-r">
            <Readout
              className="p-6"
              size="lg"
              label="Series won"
              value={`${s.models.lightgbm_wins}/${s.models.series_total}`}
              hint="LightGBM beats both baselines"
            />
            <Readout className="p-6" size="lg" label="Forecast accuracy" value={`${s.models.accuracy_cpu}%`} hint="CPU, 100 − sMAPE" />
            <Readout
              className="p-6"
              size="lg"
              label="Range coverage"
              value={`${s.models.coverage_range[0]}–${s.models.coverage_range[1]}%`}
              hint="of actuals inside the 80% range"
            />
            <Readout className="p-6" size="lg" label="Saved per week" value={fmtCurrency(weeklySavings)} hint={`across ${s.fleet.length} demo clusters`} />
          </Panel>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {s.fleet.map((f) => {
              const rows = MODEL_ORDER.map((m) => s.models.cpu.find((r) => r.cluster_id === f.id && r.model_name === m)).filter(
                (r): r is NonNullable<typeof r> => Boolean(r),
              );
              const max = Math.max(...rows.map((r) => r.mae));
              return (
                <Panel key={f.id} className="p-6">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-semibold tracking-tight">{f.name}</span>
                    <span className="eyebrow">CPU MAE</span>
                  </div>
                  <ol className="mt-5 flex flex-col gap-4">
                    {rows.map((r) => (
                      <li key={r.model_name}>
                        <div className="flex items-baseline justify-between text-[13px]">
                          <span className={r.is_production ? "font-medium" : "text-muted-foreground"}>{MODEL_LABELS[r.model_name]}</span>
                          <span className="font-mono tabular">{fmtNumber(r.mae, 1)}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-[2px] bg-muted">
                          <div
                            className={cn("h-full rounded-[2px]", r.is_production ? "bg-foreground" : "bg-muted-foreground/35")}
                            style={{ width: `${(r.mae / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                </Panel>
              );
            })}
          </div>
        </Section>

        {/* ── 04 Dashboard ─────────────────────────────────── */}
        <Section id="dashboard" index="04" eyebrow="The dashboard" title="Replay a month of traffic, hour by hour.">
          <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            A simulation clock reveals held-out data one hour at a time. Press play and watch forecasts meet reality, recommendations
            shift, and a Black Friday the model has never seen arrive at the end of the month.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Shot src="/landing/dashboard-light.png" alt="Fleet overview in light mode" caption="Fleet overview · capacity meters and next actions" />
            <Shot src="/landing/cluster-dark.png" alt="Cluster detail in dark mode" caption="Cluster detail · forecast, server plan, cost ledger" />
          </div>
        </Section>

        {/* ── 05 Run it ────────────────────────────────────── */}
        <Section id="run" index="05" eyebrow="Run it" title="One command, two minutes.">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <p className="text-[17px] leading-relaxed text-muted-foreground">
                The first start seeds a realistic synthetic dataset, trains and backtests every model, then serves the dashboard. No
                cloud account, no GPU.
              </p>
              <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                {[
                  ["Frontend", "Next.js 16 · Tailwind · Recharts"],
                  ["API", "FastAPI · SQLAlchemy · SQLite"],
                  ["Forecasting", "LightGBM quantile + conformal bands"],
                  ["Baselines", "Seasonal naive · Holt-Winters"],
                  ["Data", "Synthetic generator · Alibaba 2018 trace loader"],
                  ["Packaging", "Docker Compose · uv · pnpm"],
                ].map(([k, v]) => (
                  <li key={k} className="border-t pt-3">
                    <div className="eyebrow">{k}</div>
                    <div className="mt-1.5 text-[14px]">{v}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <CopyCommand
                lines={[
                  "# clone and start everything",
                  "git clone https://github.com/noturbob/server-load-predictor.git",
                  "cd server-load-predictor",
                  "docker compose up --build",
                  "# then open http://localhost:3000/dashboard",
                ]}
              />
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between rounded-lg border bg-card px-5 py-4 transition-colors hover:border-foreground/30"
              >
                <span className="flex items-center gap-3">
                  <GithubIcon className="size-5" />
                  <span>
                    <span className="block text-[15px] font-medium">noturbob/server-load-predictor</span>
                    <span className="block text-[13px] text-muted-foreground">Read the code, the model notes and the README</span>
                  </span>
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
          </div>
        </Section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-8">
          <div className="flex items-center gap-3">
            <LogoMark className="size-6" />
            <span className="text-sm">Server Load Predictor</span>
            <span className="eyebrow">MIT licensed</span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
              GitHub
            </a>
            <a href="#run" className="hover:text-foreground">
              Run it
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}

function Section({
  id,
  index,
  eyebrow,
  title,
  children,
}: {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-20 sm:px-8 sm:py-24">
        <div className="eyebrow flex items-center gap-2">
          <span className="text-brand">{index}</span>
          <span>{eyebrow}</span>
        </div>
        <h2 className="mt-4 mb-6 max-w-3xl text-[32px] leading-[1.08] font-semibold tracking-[-0.025em] sm:text-[44px]">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Step({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <Panel className="flex flex-col">
      <div className="p-6">
        <div className="flex size-7 items-center justify-center rounded-full border font-mono text-[12px] text-brand">{n}</div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="mt-auto border-t bg-surface-2 p-6">{children}</div>
    </Panel>
  );
}

function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure>
      <Panel className="overflow-hidden p-1.5">
        <Image src={src} alt={alt} width={1440} height={900} className="h-auto w-full rounded-[5px] border" sizes="(min-width: 1024px) 560px, 100vw" />
      </Panel>
      <figcaption className="eyebrow mt-3">{caption}</figcaption>
    </figure>
  );
}
