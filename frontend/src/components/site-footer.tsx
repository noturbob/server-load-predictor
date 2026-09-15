import { LogoMark } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LogoMark className="size-4" />
          Server Load Predictor
        </div>
        <p className="eyebrow">Synthetic data · replayed hourly · all times UTC</p>
      </div>
    </footer>
  );
}
