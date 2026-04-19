import { useQuery } from "@tanstack/react-query";
import { Database, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Admin > Performance > Neon size gauge.
 *
 * Polls GET /api/admin/db-size (60s server-side cache, so this is cheap)
 * and renders the same percentage the deploy-time capacity gate uses.
 * The point is that an operator sees headroom trending toward the
 * ceiling in the Admin UI long before a migration trips Postgres 53100.
 */

export interface DbSizeReport {
  bytes: number;
  humanBytes: string;
  budgetBytes: number;
  pctOfBudget: number;
  tone: "ok" | "warn" | "bad";
  fetchedAt: string;
  source: "live" | "cache";
}

function toneBadge(tone: "ok" | "warn" | "bad"): "outline" | "secondary" | "destructive" {
  if (tone === "bad") return "destructive";
  if (tone === "warn") return "secondary";
  return "outline";
}

function toneBar(tone: "ok" | "warn" | "bad"): string {
  if (tone === "bad") return "bg-destructive";
  if (tone === "warn") return "bg-amber-500";
  return "bg-emerald-500";
}

function humanizeBudget(bytes: number): string {
  const mb = Math.round(bytes / (1024 * 1024));
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function DbSizeCard() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery<DbSizeReport>({
    queryKey: ["/api/admin/db-size"],
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const tone = data?.tone ?? "ok";
  const pct = data?.pctOfBudget ?? 0;
  const barPct = Math.max(0, Math.min(100, pct));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" aria-hidden />
              Database size (Neon / Postgres)
            </CardTitle>
            <CardDescription className="mt-1">
              Same number the deploy-time capacity gate checks. When this trends toward 85% of budget, a
              migration can trip Postgres 53100 <code className="text-xs">(neon.max_cluster_size)</code> and
              abort the deploy. Retention prune runs daily to keep this flat.
            </CardDescription>
          </div>
          {data ? (
            <Badge variant={toneBadge(tone)} className="text-[10px]" data-testid="db-size-tone">
              {tone.toUpperCase()} · {data.source}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3" data-testid="db-size-card">
        {isError ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <span>Could not read database size. Check admin session and DB connectivity.</span>
          </div>
        ) : null}
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tabular-nums" data-testid="db-size-bytes">
              {isLoading || !data ? "—" : data.humanBytes}
            </div>
            <p className="text-xs text-muted-foreground">
              of {data ? humanizeBudget(data.budgetBytes) : "…"} budget
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums" data-testid="db-size-pct">
              {isLoading || !data ? "—" : `${data.pctOfBudget.toFixed(1)}%`}
            </div>
            <p className="text-xs text-muted-foreground">of budget used</p>
          </div>
        </div>
        <div
          className="h-2 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Database budget utilization"
        >
          <div
            className={`h-full ${toneBar(tone)} transition-[width] duration-300`}
            style={{ width: `${barPct}%` }}
            data-testid="db-size-bar"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {data
            ? `Last fetched ${new Date(dataUpdatedAt).toLocaleTimeString()} · source ${data.source}`
            : "Polling…"}
        </p>
      </CardContent>
    </Card>
  );
}

export default DbSizeCard;
