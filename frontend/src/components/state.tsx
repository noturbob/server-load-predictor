import { ServerCrash } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL, ApiError } from "@/lib/api";

export function ErrorState({ error }: { error: unknown }) {
  const offline = error instanceof ApiError && error.status === 0;
  const notReady = error instanceof ApiError && error.status === 503;
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <ServerCrash className="size-8 text-muted-foreground" />
        <div className="font-medium">
          {offline ? "The prediction API isn't reachable" : notReady ? "The API is still warming up" : "Something went wrong"}
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          {offline ? (
            <>
              Start the backend with <code className="rounded bg-muted px-1.5 py-0.5">make api</code> — the
              dashboard expects it at <code className="rounded bg-muted px-1.5 py-0.5">{API_URL}</code>.
            </>
          ) : error instanceof Error ? (
            error.message
          ) : (
            String(error)
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
