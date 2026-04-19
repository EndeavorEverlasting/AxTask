import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  lazy,
  useDeferredValue,
  useTransition,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePerfSurface } from "@/hooks/use-perf-surface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@shared/schema";
import {
  PretextImperativeList,
  type ImperativeRowTask,
  type RowEvent,
} from "@/lib/pretext-imperative-list";

/**
 * Lazy React components for the write-path. These are only resolved when the
 * user opens an edit dialog / classification popover, so the initial /tasks
 * mount does not pay their bundle + hook cost.
 */
const TaskForm = lazy(() =>
  import("@/components/task-form").then((m) => ({ default: m.TaskForm })),
);
const ClassificationBadge = lazy(() =>
  import("@/components/classification-badge").then((m) => ({
    default: m.ClassificationBadge,
  })),
);

type StatusFilter = "all" | "pending" | "in-progress" | "completed";

function formatTimestamp(value: unknown): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value as string);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function toRowTask(task: Task): ImperativeRowTask {
  const assoc = Array.isArray(task.classificationAssociations)
    ? task.classificationAssociations
    : [];
  return {
    id: task.id,
    date: task.date,
    createdAt: formatTimestamp(task.createdAt),
    updatedAt: formatTimestamp(task.updatedAt),
    priority: task.priority,
    activity: task.activity,
    notes: task.notes ?? "",
    classification: task.classification,
    classificationExtraCount: Math.max(0, assoc.length - 1),
    priorityScoreTenths: task.priorityScore,
    status: (task.status as ImperativeRowTask["status"]) ?? "pending",
    recurrence: task.recurrence ?? null,
  };
}

function matchesFilters(
  task: Task,
  priority: string,
  status: StatusFilter,
  query: string,
): boolean {
  if (priority !== "all" && task.priority !== priority) return false;
  if (status !== "all" && task.status !== status) return false;
  if (query) {
    const q = query.toLowerCase();
    if (
      !task.activity.toLowerCase().includes(q) &&
      !(task.notes ?? "").toLowerCase().includes(q) &&
      !task.classification.toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  return true;
}

export function TaskListHost() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const surfaceRef = usePerfSurface<HTMLDivElement>("task-list");

  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [classifyTask, setClassifyTask] = useState<Task | null>(null);
  const [, startListTransition] = useTransition();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) =>
      matchesFilters(t, priorityFilter, statusFilter, deferredSearch),
    );
  }, [tasks, priorityFilter, statusFilter, deferredSearch]);

  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const controllerRef = useRef<PretextImperativeList | null>(null);

  /**
   * Dynamic imports for the offline-aware sync helpers — keeps the heavy
   * offline-queue / conflict-resolution chain out of this module's static
   * graph so the initial /tasks mount stays small. The legacy `TaskList`
   * still pays that cost; this component doesn't.
   */
  const deleteTaskMutation = useMutation({
    mutationFn: async ({ id, baseTask }: { id: string; baseTask?: Task }) => {
      const mod = await import("@/lib/task-sync-api");
      try {
        await mod.syncDeleteTask(id, baseTask, queryClient);
      } catch (e) {
        if (e instanceof mod.TaskSyncAbortedError) return;
        throw e;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      toast({ title: "Task deleted" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      baseTask,
    }: {
      id: string;
      status: string;
      baseTask?: Task;
    }) => {
      const [sync, wallet] = await Promise.all([
        import("@/lib/task-sync-api"),
        import("@/lib/wallet-cache"),
      ]);
      try {
        const result = await sync.syncUpdateTask(id, { status }, baseTask, queryClient);
        return { result, wallet };
      } catch (e) {
        if (e instanceof sync.TaskSyncAbortedError) return null;
        throw e;
      }
    },
    onSuccess: (payload) => {
      if (!payload) return;
      const d = payload.result as
        | { offlineQueued?: boolean; walletBalance?: number | null }
        | undefined;
      if (d?.offlineQueued) {
        toast({
          title: "Saved offline",
          description: "Status will sync when you're back online.",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      if (typeof d?.walletBalance === "number") {
        payload.wallet.setWalletBalanceCache(queryClient, d.walletBalance);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    },
  });

  const handleRowEvent = useCallback(
    (ev: RowEvent) => {
      const task = tasks.find((t) => t.id === ev.taskId);
      if (!task) return;
      switch (ev.action) {
        case "open":
          setEditingTask(task);
          break;
        case "toggle-status":
          updateTaskStatusMutation.mutate({
            id: task.id,
            status: task.status === "completed" ? "pending" : "completed",
            baseTask: task,
          });
          break;
        case "delete":
          deleteTaskMutation.mutate({ id: task.id, baseTask: task });
          break;
        case "classify":
          setClassifyTask(task);
          break;
        default:
          break;
      }
    },
    [tasks, deleteTaskMutation, updateTaskStatusMutation],
  );

  useEffect(() => {
    const onOpenEdit = (ev: Event) => {
      const detail = (ev as CustomEvent<{ task?: Task }>).detail;
      const t = detail?.task;
      if (t && typeof t.id === "string") setEditingTask(t);
    };
    window.addEventListener("axtask-open-task-edit", onOpenEdit);
    return () => window.removeEventListener("axtask-open-task-edit", onOpenEdit);
  }, []);

  useEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return;
    const list = new PretextImperativeList(tbody, {
      onRowEvent: handleRowEvent,
    });
    controllerRef.current = list;
    return () => {
      list.destroy();
      controllerRef.current = null;
    };
  }, [handleRowEvent]);

  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const rows = visibleTasks.map(toRowTask);
    startListTransition(() => {
      ctrl.setTasks(rows);
    });
  }, [visibleTasks]);

  return (
    <Card ref={surfaceRef} data-testid="task-list-host">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden />
          All Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks…"
              className="pl-9"
              data-testid="task-search"
            />
          </div>
          <Select
            value={priorityFilter}
            onValueChange={(v) => setPriorityFilter(v)}
          >
            <SelectTrigger className="w-[140px]" data-testid="priority-filter">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-[140px]" data-testid="status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in-progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div
          className="overflow-x-auto overflow-y-auto"
          style={{ maxHeight: "70vh" }}
          data-testid="task-list-scroll"
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10 border-b">
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2 pr-4 font-medium">Updated</th>
                <th className="py-2 pr-4 font-medium">Priority</th>
                <th className="py-2 pr-4 font-medium">Activity</th>
                <th className="py-2 pr-4 font-medium">Classification</th>
                <th className="py-2 pr-4 font-medium">Priority (0–10)</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody ref={tbodyRef} data-testid="task-list-body" />
          </table>
          {!isLoading && visibleTasks.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm" data-testid="task-list-empty">
              {tasks.length === 0
                ? "No tasks yet. Create one to get started."
                : "No tasks match the current filters."}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog
        open={!!editingTask}
        onOpenChange={(o) => !o && setEditingTask(null)}
      >
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <Suspense fallback={<div className="p-4">Loading…</div>}>
              <TaskForm
                task={editingTask}
                onSuccess={() => {
                  setEditingTask(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
                }}
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!classifyTask}
        onOpenChange={(o) => !o && setClassifyTask(null)}
      >
        <DialogContent className="w-[95vw] max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle>Classification</DialogTitle>
          </DialogHeader>
          {classifyTask && (
            <Suspense fallback={<div className="p-4">Loading…</div>}>
              <ClassificationBadge
                classification={classifyTask.classification}
                classificationAssociations={classifyTask.classificationAssociations}
                taskId={classifyTask.id}
                activity={classifyTask.activity}
                notes={classifyTask.notes ?? ""}
                editable
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default TaskListHost;
