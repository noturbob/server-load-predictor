import { cn } from "@/lib/utils";

/** A bordered surface. The workhorse container of the dashboard. */
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-lg border bg-card text-card-foreground", className)} {...props} />;
}

export function PanelHeader({
  index,
  title,
  description,
  actions,
  className,
}: {
  index?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5 sm:px-6", className)}>
      <div className="min-w-0 max-w-2xl">
        <h2 className="flex items-baseline gap-2.5 text-[15px] font-semibold tracking-tight">
          {index && <span className="font-mono text-[11px] font-normal text-brand">{index}</span>}
          {title}
        </h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}

export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 pt-4 pb-5 sm:px-6 sm:pb-6", className)} {...props} />;
}

/** Page title block: an eyebrow line, a large title and a supporting sentence. */
export function PageHeading({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
      <div className="min-w-0 max-w-3xl">
        <div className="eyebrow flex flex-wrap items-center gap-x-2 gap-y-1">{eyebrow}</div>
        <h1 className="mt-3 text-[32px] leading-[1.05] font-semibold tracking-[-0.02em] sm:text-[40px]">{title}</h1>
        {children && <div className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>}
      </div>
      {aside}
    </div>
  );
}

/** Label / value pair in the mono-eyebrow style. */
export function Readout({
  label,
  value,
  hint,
  className,
  size = "md",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          "mt-2 font-medium tracking-tight",
          size === "lg" && "text-[34px] leading-none tracking-[-0.02em]",
          size === "md" && "text-[22px] leading-none",
          size === "sm" && "text-[17px] leading-none",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Compact segmented control (radio-group semantics). */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-9 items-stretch rounded-md border bg-card p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[5px] px-3 text-[13px] transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
