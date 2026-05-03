import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { WifiOff, RefreshCw, HardDrive, CloudUpload } from "lucide-react";
import { useNetworkOnline } from "@/hooks/use-network-status";
import { useToast } from "@/hooks/use-toast";
import {
  isPersistableQueryKey,
  STALE_DATA_WARNING_AFTER_MS,
} from "@/lib/query-persist-policy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOfflineQueueLength, subscribeOfflineTaskQueue } from "@/lib/offline-task-queue";

function useStalePersistedDataHint(): boolean {
  const queryClient = useQueryClient();
  return useSyncExternalStore(
    (onStore) => queryClient.getQueryCache().subscribe(onStore),
    () => {
      const now = Date.now();
      for (const q of queryClient.getQueryCache().getAll()) {
        if (!isPersistableQueryKey(q.queryKey)) continue;
        if (q.state.data === undefined) continue;
        if (!q.isStale()) continue;
        const updated = q.state.dataUpdatedAt;
        if (updated > 0 && now - updated > STALE_DATA_WARNING_AFTER_MS) {
          return true;
        }
      }
      return false;
    },
    () => false,
  );
}

function useOfflineTaskQueueLength(): number {
  return useSyncExternalStore(
    subscribeOfflineTaskQueue,
    getOfflineQueueLength,
    () => 0,
  );
}

/**
 * Phase A: shows when the browser is offline, cache is restoring from storage,
 * or cached data is old while online (subtle nudge to refresh).
 * Phase C: shows queued task mutations when online.
 */
export function OfflineDataBanner() {
  const online = useNetworkOnline();
  const isRestoring = useIsRestoring();
  const staleHint = useStalePersistedDataHint();
  const pendingOps = useOfflineTaskQueueLength();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const prevOnline = useRef(online);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!prevOnline.current && online) {
      toast({
        title: "Back online",
        description: "Refreshing data when possible.",
      });
      void queryClient.invalidateQueries();
    }
    prevOnline.current = online;
  }, [online, queryClient, toast]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void queryClient.invalidateQueries().finally(() => {
      setIsRefreshing(false);
    });
  }, [queryClient]);

  if (isRestoring) {
    return (
      <div
        className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
        role="status"
      >
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          <span>Restoring saved data from this device...</span>
        </div>
      </div>
    );
  }

  if (!online) {
    return (
      <div
        className="shrink-0 border-b border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950 dark:border-orange-900/60 dark:bg-orange-950/50 dark:text-orange-100"
        role="alert"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              {
                "You're offline — showing cached data from this device. Task edits are queued on this device and will sync when you reconnect."
              }
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            aria-disabled
            title="Reconnect to the internet to refresh data from the server."
            className="shrink-0 border-orange-300 bg-white/80 opacity-70 dark:bg-orange-950/30 dark:border-orange-800"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Sync when online
          </Button>
        </div>
      </div>
    );
  }

  if (online && pendingOps > 0) {
    return (
      <div
        className="shrink-0 border-b border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100"
        role="status"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CloudUpload className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            <span>
              {pendingOps} queued change{pendingOps === 1 ? "" : "s"} — syncing in the background when the server is
              reachable.
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", isRefreshing && "animate-spin")} aria-hidden />
            {isRefreshing ? "Refreshing…" : "Refresh data"}
          </Button>
        </div>
      </div>
    );
  }

  if (staleHint) {
    return (
      <div
        className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {isRefreshing
              ? "Refreshing data from the server…"
              : "Some cached data hasn't been refreshed recently."}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", isRefreshing && "animate-spin")} aria-hidden />
            {isRefreshing ? "Refreshing…" : "Refresh now"}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
