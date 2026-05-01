import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { syncRawTaskRequest } from "@/lib/task-sync-api";
import { recordTaskCompletedForPrediction } from "@/lib/local-markov-predictions";
import type { Task } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  CheckCircle2,
  CalendarClock,
  ArrowUpDown,
  AlertTriangle,
  Loader2,
  Sparkles,
  CheckSquare,
  XCircle,
  History,
} from "lucide-react";

export interface ProposedAction {
  type: "complete" | "reschedule" | "update" | "create_and_complete";
  taskId: string;
  taskActivity: string;
  details: Record<string, unknown>;
  confidence: number;
  reason: string;
  /** Stable unique id for this action (may differ from taskId when multiple actions target the same task). */
  actionId?: string;
}

interface BulkActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: ProposedAction[];
  message: string;
  unmatched: string[];
}

const ACTION_ICONS: Record<string, typeof CheckCircle2> = {
  complete: CheckCircle2,
  reschedule: CalendarClock,
  update: ArrowUpDown,
  create_and_complete: History,
};

const ACTION_COLORS: Record<string, string> = {
  complete: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
  reschedule: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
  update: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20",
  create_and_complete: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20",
};

const ACTION_LABELS: Record<string, string> = {
  complete: "Complete",
  reschedule: "Reschedule",
  update: "Update",
  create_and_complete: "Log done",
};

/** Max automatic retry rounds after a partial failure (each failed item tracked by stable key). */
const MAX_RETRIES = 1;

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80
    ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
    : pct >= 50
      ? "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
      : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20";

  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${color}`}>
      {pct}% match
    </span>
  );
}

export default function BulkActionDialog({
  open,
  onOpenChange,
  actions,
  message,
  unmatched,
}: BulkActionDialogProps) {
  const actionKey = useCallback((a: ProposedAction, i: number) => a.actionId ?? `${a.taskId}:${i}`, []);

  const retryAttemptsRef = useRef<Map<string, number>>(new Map());
  /** Parallel to each `applyMutation.mutate([...])` payload — stable keys for retry limits. */
  const submitKeysRef = useRef<string[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setSelected(new Set(actions.map((a, i) => actionKey(a, i))));
  }, [actions, actionKey]);

  useEffect(() => {
    if (open) retryAttemptsRef.current.clear();
  }, [open]);

  const toggleItem = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(actions.map((a, i) => actionKey(a, i))));
  }, [actions, actionKey]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const applyMutation = useMutation({
    mutationFn: async (selectedActions: ProposedAction[]) => {
      return syncRawTaskRequest(
        "POST",
        "/api/tasks/review/apply",
        { actions: selectedActions },
        queryClient,
      ) as Promise<{
        applied: number;
        failed: number;
        results: Array<{ taskId: string; success: boolean; error?: string }>;
        coinSummaries?: Array<{ taskId: string; coinsEarned: number; newBalance: number }>;
      }>;
    },
    onSuccess: (data, selectedActions) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({
          title: "Queued",
          description: "Bulk changes will apply when you're online.",
        });
        onOpenChange(false);
        return;
      }
      const results = data.results;
      const failedCount = data.failed || 0;
      if (failedCount > 0 && Array.isArray(results) && selectedActions.length > 0) {
        const keys = submitKeysRef.current;
        const failedEntries = selectedActions
          .map((action, i) => ({
            action,
            i,
            key: keys[i] ?? actionKey(action, i),
          }))
          .filter(({ i }) => {
            const r = Array.isArray(results) ? results[i] : undefined;
            return !r || r.success === false;
          });
        const eligible = failedEntries.filter(({ key }) => (retryAttemptsRef.current.get(key) ?? 0) < MAX_RETRIES);
        const skippedForLimit = failedEntries.filter(
          ({ key }) => (retryAttemptsRef.current.get(key) ?? 0) >= MAX_RETRIES,
        );

        if (eligible.length > 0 && failedEntries.length < selectedActions.length) {
          for (const { key } of eligible) {
            retryAttemptsRef.current.set(key, (retryAttemptsRef.current.get(key) ?? 0) + 1);
          }
          const toRetry = eligible.map(({ action }) => action);
          submitKeysRef.current = eligible.map(({ key }) => key);
          if (skippedForLimit.length > 0) {
            const labels = skippedForLimit.map(({ action }) => action.taskActivity || action.taskId).slice(0, 5);
            const more = skippedForLimit.length > 5 ? ` (+${skippedForLimit.length - 5} more)` : "";
            toast({
              title: "Some changes were not retried",
              description: `Retry limit reached for: ${labels.join(", ")}${more}`,
              variant: "destructive",
            });
          }
          toast({
            title: "Retrying failed changes",
            description: `${toRetry.length} update${toRetry.length !== 1 ? "s" : ""} will be retried.`,
          });
          applyMutation.mutate(toRetry);
          return;
        }
        if (skippedForLimit.length > 0) {
          const labels = skippedForLimit.map(({ action }) => action.taskActivity || action.taskId).slice(0, 6);
          toast({
            title: "Some changes were not retried",
            description: `Retry limit reached for: ${labels.join(", ")}${skippedForLimit.length > 6 ? "…" : ""}`,
            variant: "destructive",
          });
        }
      }

      const cachedTasks = queryClient.getQueryData<Task[]>(["/api/tasks"]) ?? [];
      const predictionUserId = cachedTasks[0]?.userId ?? "";
      if (predictionUserId && Array.isArray(results)) {
        for (let i = 0; i < selectedActions.length; i++) {
          const action = selectedActions[i];
          const r = results[i];
          if (!action || !r || r.success === false) continue;
          if (action.type !== "complete" && action.type !== "create_and_complete") continue;
          const resolvedId = r.taskId;
          const t = cachedTasks.find((x) => x.id === resolvedId);
          if (action.type === "create_and_complete" || !t) continue;
          if (t.status !== "completed") {
            void recordTaskCompletedForPrediction({
              userId: predictionUserId,
              task: { ...t, status: "completed" },
              previousStatus: t.status,
            });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });

      const coinSummaries = Array.isArray(data.coinSummaries) ? data.coinSummaries : [];
      const totalCoins = coinSummaries.reduce((s, c) => s + (c.coinsEarned || 0), 0);
      const coinHint =
        totalCoins > 0
          ? ` +${totalCoins} AxCoin${totalCoins !== 1 ? "s" : ""} earned (see wallet for breakdown).`
          : "";

      if (failedCount > 0) {
        toast({
          title: "Partially applied",
          description: `${data.applied} change${data.applied !== 1 ? "s" : ""} applied, ${failedCount} failed.${coinHint}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Changes applied",
          description: `${data.applied} task${data.applied !== 1 ? "s" : ""} updated successfully.${coinHint}`,
        });
        if (typeof data.applied === "number" && data.applied > 0) {
          requestFeedbackNudge("bulk_actions");
        }
      }
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to apply changes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApply = useCallback(() => {
    const selectedActions: ProposedAction[] = [];
    const keys: string[] = [];
    actions.forEach((a, i) => {
      const k = actionKey(a, i);
      if (selected.has(k)) {
        selectedActions.push(a);
        keys.push(k);
      }
    });
    if (selectedActions.length === 0) return;
    submitKeysRef.current = keys;
    applyMutation.mutate(selectedActions);
  }, [actions, selected, applyMutation, actionKey]);

  const selectedCount = selected.size;
  const totalCount = actions.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            Review Proposed Changes
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
            {message}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {actions.length > 1 && (
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectedCount} of {totalCount} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                >
                  Select all
                </button>
                <button
                  onClick={deselectAll}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Deselect all
                </button>
              </div>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {actions.map((action, i) => {
              const key = actionKey(action, i);
              const Icon = ACTION_ICONS[action.type] || CheckCircle2;
              const colorClass = ACTION_COLORS[action.type] || "";
              const isSelected = selected.has(key);

              return (
                <motion.div
                  key={key}
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? "border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 opacity-60"
                  }`}
                  onClick={() => toggleItem(key)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleItem(key)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5"
                  />
                  <div className={`p-1.5 rounded-md ${colorClass}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {action.taskActivity}
                      </p>
                      <ConfidenceBadge confidence={action.confidence} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colorClass}`}>
                        {ACTION_LABELS[action.type]}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {action.reason}
                      </span>
                    </div>
                    {action.type === "reschedule" &&
                    typeof action.details.fromDate === "string" &&
                    typeof action.details.newDate === "string" ? (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        Currently: {action.details.fromDate} → {action.details.newDate}
                      </p>
                    ) : null}
                    {action.type === "create_and_complete" && typeof action.details.date === "string" ? (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        Log on: {action.details.date}
                      </p>
                    ) : null}
                    {action.confidence < 0.5 && (
                      <p className="text-[11px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" />
                        Low confidence match — please verify
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {unmatched.length > 0 && (
            <div className="mt-3 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
              <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 flex items-center gap-1.5 mb-1">
                <XCircle className="h-3.5 w-3.5" />
                Could not match
              </p>
              <ul className="text-xs text-yellow-600 dark:text-yellow-500 space-y-0.5">
                {unmatched.map((u, i) => (
                  <li key={i}>"{u}"</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={applyMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={selectedCount === 0 || applyMutation.isPending}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white gap-2"
          >
            {applyMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckSquare className="h-4 w-4" />
            )}
            Apply {selectedCount} Change{selectedCount !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
