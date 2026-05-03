import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicDbSizeHistoryResponse } from "@shared/public-client-dtos";
import { humanBytes } from "./format-bytes";

/**
 * 30-day (default) DB-size trend fed by db_size_snapshots. The snapshot
 * writer (server/workers/db-size-snapshot.ts) piggybacks on the daily
 * retention-prune tick, so a fresh DB will show one point per day after
 * the first tick has fired. Until then we render a friendly empty state.
 */
export function DbSizeTrendCard() {
  const { data, isLoading, isError } = useQuery<PublicDbSizeHistoryResponse>({
    queryKey: ["/api/admin/db-size/history?days=30"],
    staleTime: 5 * 60 * 1000,
  });

  const points = data?.points ?? [];
  const maxBytes = points.reduce((m, p) => Math.max(m, p.dbSizeBytes), 0);
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const first = points.length > 0 ? points[0] : null;
  const delta = latest && first ? latest.dbSizeBytes - first.dbSizeBytes : 0;
  const deltaLabel = delta === 0 ? "flat" : delta > 0 ? `+${humanBytes(delta)}` : `-${humanBytes(Math.abs(delta))}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <LineChart className="h-4 w-4 text-primary" aria-hidden />
          Database size — 30 day trend
        </CardTitle>
        <CardDescription>
          Daily snapshots from <code className="text-xs">db_size_snapshots</code>. Retention prune runs every 24h;
          the gauge above is live, the chart below is the daily rollup.
        </CardDescription>
      </CardHeader>
      <CardContent data-testid="db-size-trend-card">
        {isError ? (
          <p className="text-sm text-destructive">Failed to load DB size history.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No snapshots yet — the first one is captured automatically on the next retention-prune tick (within 24h of server start).
          </p>
        ) : (
          <div className="space-y-3" data-testid="db-size-trend-rendered">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl font-semibold tabular-nums">{humanBytes(latest!.dbSizeBytes)}</div>
                <p className="text-xs text-muted-foreground">latest capture</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums">{deltaLabel}</div>
                <p className="text-xs text-muted-foreground">{points.length} day window</p>
              </div>
            </div>
            {/* Sparkline: simple SVG polyline to avoid pulling a chart lib. */}
            <svg
              viewBox="0 0 300 60"
              preserveAspectRatio="none"
              className="w-full h-16 rounded border border-border bg-muted/40"
              aria-label="Database size trend"
              role="img"
            >
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-primary"
                points={points
                  .map((p, i) => {
                    const x = points.length === 1 ? 150 : (i / (points.length - 1)) * 300;
                    const y = maxBytes > 0 ? 60 - (p.dbSizeBytes / maxBytes) * 58 - 1 : 58;
                    return `${x.toFixed(2)},${y.toFixed(2)}`;
                  })
                  .join(" ")}
              />
            </svg>
            <p className="text-[11px] text-muted-foreground">
              From {new Date(first!.capturedAt).toLocaleDateString()} to {new Date(latest!.capturedAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DbSizeTrendCard;
