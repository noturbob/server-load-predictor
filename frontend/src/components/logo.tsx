import { cn } from "@/lib/utils";

/**
 * The mark: stepped server capacity riding just above a load curve —
 * the product's promise of scaling ahead of demand.
 */
export const LOGO_STEPS = "M6 17H10.5V12H13.5V9H18.5V12H21.5V17H26";
export const LOGO_CURVE = "M6 23.1C9.6 23.1 11.3 22.6 12.9 18.9C14 16.3 14.7 13.9 16 13.9C17.3 13.9 18 16.3 19.1 18.9C20.7 22.6 22.4 23.1 26 23.1";

export function LogoMark({ className, title = "Server Load Predictor" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} role="img" aria-label={title}>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path
        d={LOGO_STEPS}
        fill="none"
        className="stroke-background"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d={LOGO_CURVE} fill="none" className="stroke-brand" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">Load Predictor</span>
        <span className="mt-1 font-mono text-[9.5px] tracking-[0.18em] text-muted-foreground uppercase">
          Server capacity
        </span>
      </span>
    </span>
  );
}
