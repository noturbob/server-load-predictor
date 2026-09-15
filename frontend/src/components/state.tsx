import { ServerCrash } from "lucide-react";

import { Panel } from "@/components/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL, ApiError } from "@/lib/api";

export function ErrorState({ error }: { error: unknown }) {
  const offline = error instanceof ApiError && error.status === 0;
  const notReady = error instanceof ApiError && error.status === 503;
  return (
    <Panel className="border-dashed">
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <ServerCrash className="size-7 text-muted-foreground" strokeWidth={1.5} />
        <div className="eyebrow">{offline ? "Connection lost" : notReady ? "Warming up" : "Error"}</div>
        <div className="text-lg font-medium">
          {offline ? "The prediction API isn't reachable" : notReady ? "The API is still preparing models" : "Something went wrong"}
        </div>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {offline ? (
            <>
              Start the backend with <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">make api</code>. The
              dashboard expects it at <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{API_URL}</code>.
            </>
          ) : error instanceof Error ? (
            error.message
          ) : (
            String(error)
          )}
        </p>
      </div>
    </Panel>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <Skeleton className="w-full rounded-md" style={{ height }} />;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
