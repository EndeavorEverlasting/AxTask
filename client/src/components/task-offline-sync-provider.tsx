import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNetworkOnline } from "@/hooks/use-network-status";
import { drainOfflineTaskQueue } from "@/lib/task-sync-api";
import { TaskConflictDialog } from "@/components/task-conflict-dialog";
import { subscribeOfflineTaskQueue } from "@/lib/offline-task-queue";

/** Phase C: drain persisted task mutation queue when connectivity returns; hosts conflict modal. */
export function TaskOfflineSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const online = useNetworkOnline();
  const [queueEpoch, setQueueEpoch] = useState(0);

  useEffect(() => subscribeOfflineTaskQueue(() => setQueueEpoch((n) => n + 1)), []);

  useEffect(() => {
    if (!online) return;
    void drainOfflineTaskQueue(queryClient);
  }, [online, queryClient, queueEpoch]);

  return (
    <>
      {children}
      <TaskConflictDialog />
    </>
  );
}
