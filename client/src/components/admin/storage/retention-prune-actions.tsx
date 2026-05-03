import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import type {
  PublicRetentionPreviewResponse,
  PublicRetentionRunResponse,
} from "@shared/public-client-dtos";

/**
 * Retention prune admin actions: a dry-run preview table plus a
 * step-up-authenticated "Run prune now" button. The background 24h
 * ticker makes this manual control rarely necessary, but it's the
 * escape hatch for when an operator sees the Neon size gauge climbing
 * and doesn't want to wait for tomorrow's tick.
 *
 * The POST route is rate-limited (adminRetentionRunLimiter in
 * server/routes.ts) so a click-storm can't queue up concurrent sweeps.
 */
export function RetentionPruneActions() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<PublicRetentionRunResponse | null>(null);

  const { data: preview, isLoading, isError, refetch } =
    useQuery<PublicRetentionPreviewResponse>({
      queryKey: ["/api/admin/retention/preview"],
      refetchInterval: 10 * 60 * 1000,
      staleTime: 5 * 60 * 1000,
    });

  const runMutation = useMutation({
    mutationFn: async (): Promise<PublicRetentionRunResponse> => {
      const res = await apiRequest("POST", "/api/admin/retention/run");
      return (await res.json()) as PublicRetentionRunResponse;
    },
    onSuccess: (result) => {
      setLastResult(result);
      // Refresh the preview and every storage card that might have moved
      // after a sweep. We don't individually invalidate the db-size
      // gauge because the server caches it for 60s anyway.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/retention/preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-storage/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-storage/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/db-size"] });
    },
  });

  const total = preview?.totalRowsToDelete ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-primary" aria-hidden />
          Retention prune
        </CardTitle>
        <CardDescription>
          Dry-run preview of what today's prune sweep would delete. Runs automatically every 24h — this
          button is the manual override. Action is audited as{" "}
          <code className="text-xs">retention_prune_manual</code> in <code className="text-xs">security_logs</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" data-testid="retention-prune-actions">
        {isError ? (
          <p className="text-sm text-destructive">Failed to load retention preview.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading preview…</p>
        ) : preview && preview.rows.length > 0 ? (
          <table className="w-full text-sm" data-testid="retention-preview-table">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 px-2">Table</th>
                <th className="py-2 px-2">Cutoff (UTC)</th>
                <th className="py-2 px-2 text-right">Rows to delete</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.table} className="border-b border-border/60" data-testid={`retention-preview-row-${r.table}`}>
                  <td className="py-2 px-2 font-mono text-xs">{r.table}</td>
                  <td className="py-2 px-2 text-xs">{new Date(r.cutoff).toISOString().slice(0, 10)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {r.rowsToDelete < 0 ? "—" : r.rowsToDelete.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No rows old enough to prune.</p>
        )}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div className="text-sm">
            <span className="font-medium">{total.toLocaleString()}</span>{" "}
            <span className="text-muted-foreground">rows would be deleted</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()} data-testid="retention-preview-refresh">
              Refresh preview
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={total === 0 || runMutation.isPending}
                  data-testid="retention-run-button"
                >
                  {runMutation.isPending ? "Pruning…" : "Run prune now"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                    Run retention prune now?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete <span className="font-semibold">{total.toLocaleString()}</span> rows
                    across {preview?.rows.length ?? 0} retention tables. The sweep is idempotent and
                    audited, but it cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="retention-run-cancel">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => runMutation.mutate()}
                    data-testid="retention-run-confirm"
                  >
                    Run prune
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {lastResult ? (
          <div className="text-xs text-muted-foreground border-t border-border pt-2" data-testid="retention-run-result">
            Last sweep deleted {lastResult.securityEventsDeleted} security_events,{" "}
            {lastResult.securityLogsDeleted} security_logs, {lastResult.usageSnapshotsDeleted} usage_snapshots,{" "}
            {lastResult.passwordResetTokensDeleted} password_reset_tokens,{" "}
            {lastResult.dbSizeSnapshotsDeleted} db_size_snapshots, {lastResult.userLocationEventsDeleted}{" "}
            user_location_events, {lastResult.aiInteractionsDeleted} ai_interactions in {lastResult.durationMs}ms with{" "}
            {lastResult.errors.length} errors.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default RetentionPruneActions;
