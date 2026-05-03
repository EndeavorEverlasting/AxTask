import { useQuery } from "@tanstack/react-query";
import { FolderTree } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicDbStorageDomainsResponse } from "@shared/public-client-dtos";
import { humanBytes, percentOf } from "./format-bytes";

/**
 * Per-domain rollup (core / tasks / gamification / ops / unknown)
 * matching the Phase F-1 schema split. Stacked bar renders table bytes
 * vs index bytes per domain so operators can see whether a domain is
 * fat because of row data or because of index bloat.
 */
export function PerDomainRollup() {
  const { data, isLoading, isError } = useQuery<PublicDbStorageDomainsResponse>({
    queryKey: ["/api/admin/db-storage/domains"],
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const rollup = data?.rollup ?? [];
  const totalBytes = rollup.reduce((s, r) => s + r.totalBytes, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-primary" aria-hidden />
          Storage by domain
        </CardTitle>
        <CardDescription>
          Rolls the 50+ tables into the four Phase F-1 domains. "unknown" catches anything not
          re-exported from <code className="text-xs">shared/schema/*</code> (should normally be 0).
        </CardDescription>
      </CardHeader>
      <CardContent data-testid="per-domain-rollup">
        {isError ? (
          <p className="text-sm text-destructive">Failed to load per-domain storage rollup.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rollup.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tables reported.</p>
        ) : (
          <div className="space-y-3">
            {rollup.map((row) => {
              const pct = percentOf(row.totalBytes, totalBytes);
              const tablePct = row.totalBytes > 0 ? (row.tableBytes / row.totalBytes) * 100 : 0;
              const indexPct = row.totalBytes > 0 ? (row.indexBytes / row.totalBytes) * 100 : 0;
              return (
                <div key={row.domain} data-testid={`domain-row-${row.domain}`} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{row.domain}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.tableCount} {row.tableCount === 1 ? "table" : "tables"} · {row.liveRows.toLocaleString()} rows
                      </span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span>{humanBytes(row.totalBytes)}</span>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="bg-primary h-full"
                      style={{ width: `${tablePct}%` }}
                      title={`Heap: ${humanBytes(row.tableBytes)}`}
                    />
                    <div
                      className="bg-secondary h-full"
                      style={{ width: `${indexPct}%` }}
                      title={`Indexes: ${humanBytes(row.indexBytes)}`}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-primary" />heap</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-secondary" />indexes</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PerDomainRollup;
