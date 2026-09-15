import { cn } from "@/lib/utils";

/**
 * One tick per server, like units in a rack.
 *  ■ ink      running and needed
 *  ▨ muted    running but not needed (can be removed)
 *  □ orange   needed but not running yet (add)
 */
export function CapacityMeter({
  current,
  recommended,
  peak,
  className,
}: {
  current: number;
  recommended: number;
  peak?: number;
  className?: string;
}) {
  const total = Math.max(current, recommended, peak ?? 0, 1);
  const units = Array.from({ length: total }, (_, i) => {
    if (i < Math.min(current, recommended)) return "keep";
    if (i < current) return "surplus";
    if (i < recommended) return "add";
    return "headroom";
  });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="grid h-7 gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`${current} servers running, ${recommended} recommended${peak ? `, peak need ${peak}` : ""}`}
      >
        {units.map((kind, i) => (
          <span
            key={i}
            className={cn(
              "rounded-[2px]",
              kind === "keep" && "bg-foreground",
              kind === "surplus" && "bg-muted-foreground/25",
              kind === "add" && "border-[1.5px] border-brand bg-brand-soft",
              kind === "headroom" && "border border-dashed border-muted-foreground/40",
            )}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        <Key className="bg-foreground" label="Needed" />
        {current > recommended && <Key className="bg-muted-foreground/25" label={`Surplus ${current - recommended}`} />}
        {recommended > current && <Key className="border-[1.5px] border-brand bg-brand-soft" label={`Add ${recommended - current}`} />}
        {peak !== undefined && peak > Math.max(current, recommended) && (
          <Key className="border border-dashed border-muted-foreground/60" label={`Peak ${peak}`} />
        )}
      </div>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2.5 w-1.5 rounded-[1.5px]", className)} />
      {label}
    </span>
  );
}
