import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const isDrainingRef = useRef(false);
  const queueEpochRef = useRef(0);
  const onlineRef = useRef(online);

  useEffect(() => {
    queueEpochRef.current = queueEpoch;
  }, [queueEpoch]);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    return subscribeOfflineTaskQueue(() => setQueueEpoch((n) => n + 1));
  }, []);

  useEffect(() => {
    if (!online) return;
    if (isDrainingRef.current) return;
    isDrainingRef.current = true;
    void (async () => {
      try {
        while (onlineRef.current) {
          const capturedEpoch = queueEpochRef.current;
          try {
            await drainOfflineTaskQueue(queryClient);
          } catch (err) {
            console.error("[offline-task-queue] drain failed", err);
          }
          if (!onlineRef.current) break;
          if (queueEpochRef.current === capturedEpoch) break;
        }
      } finally {
        isDrainingRef.current = false;
      }
    })();
  }, [online, queryClient, queueEpoch]);

  return (
    <>
      {children}
      <TaskConflictDialog />
    </>
  );
}
