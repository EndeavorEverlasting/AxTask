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
import { Search, ClipboardList, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@shared/schema";
import type { PublicTaskListItem } from "@shared/public-client-dtos";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PretextImperativeList,
  type ImperativeRowTask,
  type RowEvent,
} from "@/lib/pretext-imperative-list";
import {
  readTaskListRouteFilters,
  clearTaskListRouteFilters,
  taskMatchesRouteFilter,
  describeRouteFilter,
  type TaskListRouteFilter,
} from "@/lib/task-list-route-filters";
import { isShoppingTask } from "@shared/shopping-tasks";
import { useVoiceOptional } from "@/hooks/use-voice";

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
type SortDirection = "asc" | "desc";
type SortColumn =
  | "date"
  | "updatedAt"
  | "priority"
  | "activity"
  | "classification"
  | "priorityScore"
  | "status";
type SortState = { column: SortColumn; direction: SortDirection } | null;

type HeaderFilterState = {
  priority: string[];
  status: StatusFilter[];
  classification: string[];
};

type FilterIntentSource =
  | "header_priority"
  | "header_status"
  | "header_classification"
  | "top_priority"
  | "top_status"
  | "route_chip";

/**
 * Variant switch for this shared host.
 *
 *   - `default` — All Tasks page (/tasks).
 *   - `shopping` — Shopping list page (/shopping). Narrows the cache
 *     to tasks classified as Shopping (or whose activity/notes look
 *     shoppy per `isShoppingTask`), defaults the status filter to
 *     `pending` (unpurchased items), and relabels surface copy so
 *     "Completed" reads as "Purchased" end-to-end.
 *
 * Adding a new variant is a matter of extending `TaskListHostVariant`,
 * plumbing a `prefilter` + `copy` function through, and writing a
 * contract test that pins the filter predicate.
 */
export type TaskListHostVariant = "default" | "shopping";

interface VariantCopy {
  title: string;
  emptyNoResults: string;
  emptyZero: string;
  searchPlaceholder: string;
  completedLabel: string;
  statusColumnLabel: string;
}

const DEFAULT_COPY: VariantCopy = {
  title: "All Tasks",
  emptyNoResults: "No tasks match the current filters.",
  emptyZero: "No tasks yet. Create one to get started.",
  searchPlaceholder: "Search tasks…",
  completedLabel: "Completed",
  statusColumnLabel: "Status",
};

const SHOPPING_COPY: VariantCopy = {
  title: "Shopping list",
  emptyNoResults: "No shopping items match the current filters.",
  emptyZero: "No shopping items yet. Add one with voice or by creating a Shopping task.",
  searchPlaceholder: "Search shopping items…",
  completedLabel: "Purchased",
  statusColumnLabel: "Purchased",
};

function copyFor(variant: TaskListHostVariant): VariantCopy {
  return variant === "shopping" ? SHOPPING_COPY : DEFAULT_COPY;
}

/**
 * Variant-level cache pre-filter. Runs before the user-visible search /
 * priority / status filters so the `visibleTasks` memo already shows
 * the correct "universe" for the page. Kept as a pure function so the
 * shopping contract test can assert it against fixture tasks without
 * mounting the component.
 */
export function applyVariantPrefilter<T extends { classification: string; activity: string; notes?: string | null }>(
  variant: TaskListHostVariant,
  tasks: T[],
): T[] {
  if (variant === "shopping") return tasks.filter((t) => isShoppingTask(t));
  return tasks;
}

function formatTimestamp(value: unknown): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value as string);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/**
 * Row type accepted by `toRowTask`. The GET /api/tasks endpoint now
 * returns `PublicTaskListItem` — which drops `userId` and replaces
 * `classificationAssociations` with a single `classificationExtraCount`
 * integer — but the client cache also holds optimistic `Task` objects
 * produced by `optimisticTaskFromInsert` during offline writes. So this
 * helper tolerates either shape: pick up the integer when present,
 * fall back to `associations.length - 1` otherwise.
 */
type TaskListRow = PublicTaskListItem | Task;

function toRowTask(task: TaskListRow): ImperativeRowTask {
  let extras: number;
  if (
    "classificationExtraCount" in task &&
    typeof task.classificationExtraCount === "number"
  ) {
    extras = task.classificationExtraCount;
  } else {
    const assoc = Array.isArray((task as Task).classificationAssociations)
      ? ((task as Task).classificationAssociations as unknown[])
      : [];
    extras = Math.max(0, assoc.length - 1);
  }
  const noteAttachmentIds =
    "noteAttachmentIds" in task && Array.isArray((task as PublicTaskListItem).noteAttachmentIds)
      ? (task as PublicTaskListItem).noteAttachmentIds
      : [];
  return {
    id: task.id,
    date: task.date,
    createdAt: formatTimestamp(task.createdAt),
    updatedAt: formatTimestamp(task.updatedAt),
    priority: task.priority,
    activity: task.activity,
    notes: task.notes ?? "",
    noteAttachmentIds,
    classification: task.classification,
    classificationExtraCount: extras,
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

function comparePriority(a: string, b: string): number {
  const order: Record<string, number> = {
    lowest: 0,
    low: 1,
    medium: 2,
    "medium-high": 3,
    high: 4,
    highest: 5,
  };
  const av = order[a.toLowerCase()] ?? 99;
  const bv = order[b.toLowerCase()] ?? 99;
  if (av !== bv) return av - bv;
  return a.localeCompare(b);
}

function compareStatus(a: Task["status"], b: Task["status"]): number {
  const order: Record<string, number> = {
    pending: 0,
    "in-progress": 1,
    completed: 2,
  };
  const av = order[a] ?? 99;
  const bv = order[b] ?? 99;
  if (av !== bv) return av - bv;
  return a.localeCompare(b);
}

function headerFilterMatches(task: Task, filters: HeaderFilterState): boolean {
  if (filters.priority.length > 0 && !filters.priority.includes(task.priority)) return false;
  if (filters.status.length > 0 && !filters.status.includes(task.status as StatusFilter)) return false;
  if (
    filters.classification.length > 0 &&
    !filters.classification.includes(task.classification)
  ) {
    return false;
  }
  return true;
}

/**
 * Lazy detail hydration for the classify dialog.
 *
 * The /tasks list cache is now slim — no `classificationAssociations`.
 * This dialog body fetches the full task on demand so the dialog body
 * can render the per-label confidence pills. The extra network call is
 * trivial (one row, sub-1KB) and only fires when the user intentionally
 * clicks the classification chip.
 */
function ClassifyTaskDialogBody({ task }: { task: TaskListRow }) {
  const { data: full } = useQuery<Task>({
    queryKey: [`/api/tasks/${task.id}`],
  });
  const associations = full?.classificationAssociations
    ?? (task as Partial<Task>).classificationAssociations
    ?? null;
  return (
    <ClassificationBadge
      classification={task.classification}
      classificationAssociations={associations}
      taskId={task.id}
      activity={task.activity}
      notes={task.notes ?? ""}
      editable
    />
  );
}

export interface TaskListHostProps {
  /** Page variant ("default" = /tasks, "shopping" = /shopping). */
  variant?: TaskListHostVariant;
}

export function TaskListHost({ variant = "default" }: TaskListHostProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const surfaceRef = usePerfSurface<HTMLDivElement>(
    variant === "shopping" ? "shopping-list" : "task-list",
  );
  const copy = copyFor(variant);

  /* Hydrate initial search + saved filter from the URL so planner tile
   * deep-links like /tasks?filter=overdue&q=report land on a pre-filtered
   * view. The params are stripped from the location after hydration so
   * reloads / back-nav don't re-apply them. */
  const initialRoute = useMemo(() => readTaskListRouteFilters(), []);
  const [searchQuery, setSearchQuery] = useState(initialRoute.q);
  const deferredSearch = useDeferredValue(searchQuery);
  const [priorityFilter, setPriorityFilter] = useState("all");
  /* Shopping defaults to "pending" (unpurchased items) to match the
   * legacy /shopping behavior. Task view defaults to "all". */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    variant === "shopping" ? "pending" : "all",
  );
  const [sortState, setSortState] = useState<SortState>(null);
  const [headerFilters, setHeaderFilters] = useState<HeaderFilterState>({
    priority: [],
    status: [],
    classification: [],
  });
  const [routeFilter, setRouteFilter] = useState<TaskListRouteFilter>(
    initialRoute.filter,
  );
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [classifyTask, setClassifyTask] = useState<Task | null>(null);
  const [, startListTransition] = useTransition();

  const {
    data: tasks = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const voiceOptional = useVoiceOptional();
  const voiceSearchSignal = voiceOptional?.voiceSearchQuery ?? null;
  const voiceOptionalRef = useRef(voiceOptional);
  voiceOptionalRef.current = voiceOptional;

  /* After voice `prepare_task_search` dictation, `handleVoiceResult` sets
   * `voiceSearchQuery` in context — pull it into the visible filter once. */
  useEffect(() => {
    if (voiceSearchSignal == null) return;
    const ctx = voiceOptionalRef.current;
    if (!ctx) return;
    const q = ctx.consumeVoiceSearch();
    if (q) setSearchQuery(q);
  }, [voiceSearchSignal]);

  /* React Query is `offlineFirst` + `refetchOnWindowFocus: false`. If the
   * cache is empty AND we're not already fetching AND we haven't errored,
   * the user would otherwise see a permanent "no tasks" empty state while
   * the server actually has tasks. Kick a single refetch on mount so a
   * cold navigation to /tasks always pulls fresh data. */
  useEffect(() => {
    if (tasks.length === 0 && !isFetching && !isError) {
      void refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Server-side search beacon.
   *
   * The legacy `TaskList` called GET /api/tasks/search/:query on every
   * query change — not for its results (we filter client-side for
   * instant UX) but because that endpoint is the server-side trigger
   * for the capped `task_search_reward` engagement coin. Users would
   * silently stop earning that coin when we migrated /tasks to the
   * pretext host in pass 2, which is a UX regression we hadn't meant
   * to ship.
   *
   * This effect restores the trigger without re-introducing the render
   * cost: fire-and-forget fetch, 800ms debounce, min 2-char query, no
   * result handling. The server applies the daily cap server-side via
   * `tryCappedCoinAward`, so spamming the search bar is a no-op.
   */
  useEffect(() => {
    const q = deferredSearch.trim();
    if (q.length < 2) return;
    const handle = window.setTimeout(() => {
      fetch(`/api/tasks/search/${encodeURIComponent(q)}`, {
        credentials: "include",
      }).catch(() => {
        /* Engagement beacon — network errors are silent. */
      });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [deferredSearch]);

  const prefilteredTasks = useMemo(
    () => applyVariantPrefilter(variant, tasks),
    [variant, tasks],
  );

  const classificationOptions = useMemo(
    () =>
      Array.from(new Set(prefilteredTasks.map((t) => t.classification)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [prefilteredTasks],
  );
  const priorityOptions = useMemo(
    () =>
      Array.from(new Set(prefilteredTasks.map((t) => t.priority)))
        .filter(Boolean)
        .sort(comparePriority),
    [prefilteredTasks],
  );

  const toggleHeaderFilter = useCallback(
    <K extends keyof HeaderFilterState>(
      key: K,
      value: HeaderFilterState[K][number],
    ) => {
      setHeaderFilters((prev) => {
        const existing = prev[key] as string[];
        const raw = String(value);
        const next = existing.includes(raw)
          ? existing.filter((v) => v !== raw)
          : [...existing, raw];
        return { ...prev, [key]: next } as HeaderFilterState;
      });
    },
    [],
  );

  const emitFilterIntent = useCallback(
    (source: FilterIntentSource, value?: string) => {
      fetch("/api/tasks/filter-intent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          value: value ? String(value).slice(0, 120) : undefined,
        }),
      }).catch(() => {
        // Engagement signal only; ignore transient network failures.
      });
    },
    [],
  );

  const cycleSort = useCallback((column: SortColumn) => {
    setSortState((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }, []);

  const visibleTasks = useMemo(() => {
    /* Variant prefilter first (cheap classification check), then the
     * per-user search/priority/status/route filters. Kept in this
     * order so the pure `applyVariantPrefilter` helper can be
     * exercised by a contract test without doing any UI mounting. */
    const filtered = prefilteredTasks.filter(
      (t) =>
        matchesFilters(t, priorityFilter, statusFilter, deferredSearch) &&
        taskMatchesRouteFilter(t, routeFilter) &&
        headerFilterMatches(t, headerFilters),
    );
    if (!sortState) return filtered;
    const dir = sortState.direction === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      switch (sortState.column) {
        case "date":
          return a.date.localeCompare(b.date) * dir;
        case "updatedAt":
          return (
            new Date(a.updatedAt ?? a.createdAt ?? 0).getTime() -
            new Date(b.updatedAt ?? b.createdAt ?? 0).getTime()
          ) * dir;
        case "priority":
          return comparePriority(a.priority, b.priority) * dir;
        case "activity":
          return a.activity.localeCompare(b.activity) * dir;
        case "classification":
          return a.classification.localeCompare(b.classification) * dir;
        case "priorityScore":
          return (a.priorityScore - b.priorityScore) * dir;
        case "status":
          return compareStatus(a.status, b.status) * dir;
        default:
          return 0;
      }
    });
    return sorted;
  }, [
    prefilteredTasks,
    priorityFilter,
    statusFilter,
    deferredSearch,
    routeFilter,
    headerFilters,
    sortState,
  ]);

  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  /** Wired to `axtask-focus-task-search` (Alt+F, sidebar Find, planner fallback). */
  const searchInputRef = useRef<HTMLInputElement>(null);
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
    const onFocusSearch = (ev: Event) => {
      const detail = (ev as CustomEvent<{ query?: string }>).detail;
      if (detail && typeof detail.query === "string") {
        setSearchQuery(detail.query);
      }
      /* Events from Alt+F / sidebar use `new Event(...)` with no detail — we
       * still must focus the visible search field or find feels dead. */
      const run = () => searchInputRef.current?.focus({ preventScroll: false });
      requestAnimationFrame(() => {
        requestAnimationFrame(run);
      });
    };
    window.addEventListener("axtask-open-task-edit", onOpenEdit);
    window.addEventListener("axtask-focus-task-search", onFocusSearch);
    return () => {
      window.removeEventListener("axtask-open-task-edit", onOpenEdit);
      window.removeEventListener("axtask-focus-task-search", onFocusSearch);
    };
  }, []);

  /* Strip ?filter= / ?q= from the URL once we've hydrated so the saved
   * filter doesn't reapply after the user clears it. We keep state in
   * React so the chip stays clickable until the user dismisses it. */
  useEffect(() => {
    if (initialRoute.filter !== "none" || initialRoute.q !== "") {
      clearTaskListRouteFilters();
    }
  }, [initialRoute]);

  /* Carry the latest-visible rows in a ref so the controller-mount effect
   * can seed them synchronously. Without this ref we hit a mount-order
   * bug: React renders pass 1 with `controllerRef.current === null`, the
   * visibleTasks effect no-ops, then pass 2 mounts the controller — but
   * visibleTasks hasn't changed reference, so the visibleTasks effect
   * doesn't re-fire, and the tbody stays empty forever. */
  const visibleTasksRef = useRef<Task[]>(visibleTasks);
  visibleTasksRef.current = visibleTasks;

  useEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return;
    const list = new PretextImperativeList(tbody, {
      onRowEvent: handleRowEvent,
    });
    controllerRef.current = list;
    /* Seed the controller with whatever visible rows we already have so
     * the first paint after mount shows real <tr> elements even though
     * visibleTasks hasn't changed reference since pass 1. */
    list.setTasks(visibleTasksRef.current.map(toRowTask));
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
          {copy.title}
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
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={copy.searchPlaceholder}
              className="pl-9"
              data-testid="task-search"
            />
          </div>
          <Select
            value={priorityFilter}
            onValueChange={(v) => {
              setPriorityFilter(v);
              if (v !== "all") emitFilterIntent("top_priority", v);
            }}
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
            onValueChange={(v) => {
              setStatusFilter(v as StatusFilter);
              if (v !== "all") emitFilterIntent("top_status", v);
            }}
          >
            <SelectTrigger className="w-[140px]" data-testid="status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in-progress">In progress</SelectItem>
              <SelectItem value="completed">{copy.completedLabel}</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            className="text-xs rounded-md border border-border px-2.5 py-2 hover:bg-accent"
            onClick={() =>
              setHeaderFilters({
                priority: [],
                status: [],
                classification: [],
              })
            }
            data-testid="clear-header-filters"
          >
            Clear header filters
          </button>
        </div>

        {routeFilter !== "none" && (
          <div
            className="flex items-center gap-2 text-xs text-muted-foreground"
            data-testid="task-list-route-chip"
          >
            <span>Showing:</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
              {describeRouteFilter(routeFilter)}
              <button
                type="button"
                onClick={() => {
                  emitFilterIntent("route_chip", String(routeFilter));
                  setRouteFilter("none");
                }}
                className="ml-1 -mr-1 rounded-full hover:bg-primary/20 p-0.5"
                aria-label="Clear saved filter"
                data-testid="task-list-route-chip-clear"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          </div>
        )}

        <div
          className="overflow-x-auto overflow-y-auto"
          style={{ maxHeight: "70vh" }}
          data-testid="task-list-scroll"
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10 border-b">
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => cycleSort("date")}
                    data-testid="header-sort-date"
                  >
                    Date
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2 pr-4 font-medium">
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => cycleSort("updatedAt")}
                    data-testid="header-sort-updated"
                  >
                    Updated
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => cycleSort("priority")}
                      data-testid="header-sort-priority"
                    >
                      Priority
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="rounded border border-transparent px-1 hover:border-border hover:text-foreground"
                          data-testid="header-filter-priority-trigger"
                          aria-label="Filter priority"
                        >
                          ▾
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Priority filter</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {priorityOptions.map((p) => (
                          <DropdownMenuCheckboxItem
                            key={p}
                            checked={headerFilters.priority.includes(p)}
                            onCheckedChange={() => {
                              emitFilterIntent("header_priority", p);
                              toggleHeaderFilter("priority", p);
                            }}
                          >
                            {p}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => cycleSort("activity")}
                    data-testid="header-sort-activity"
                  >
                    Activity
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => cycleSort("classification")}
                      data-testid="header-sort-classification"
                    >
                      Classification
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="rounded border border-transparent px-1 hover:border-border hover:text-foreground"
                          data-testid="header-filter-classification-trigger"
                          aria-label="Filter classification"
                        >
                          ▾
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Classification filter</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {classificationOptions.map((c) => (
                          <DropdownMenuCheckboxItem
                            key={c}
                            checked={headerFilters.classification.includes(c)}
                            onCheckedChange={() => {
                              emitFilterIntent("header_classification", c);
                              toggleHeaderFilter("classification", c);
                            }}
                          >
                            {c}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => cycleSort("priorityScore")}
                    data-testid="header-sort-priority-score"
                  >
                    Priority (0–10)
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => cycleSort("status")}
                      data-testid="header-sort-status"
                    >
                      {copy.statusColumnLabel}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="rounded border border-transparent px-1 hover:border-border hover:text-foreground"
                          data-testid="header-filter-status-trigger"
                          aria-label="Filter status"
                        >
                          ▾
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Status filter</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(["pending", "in-progress", "completed"] as StatusFilter[]).map((s) => (
                          <DropdownMenuCheckboxItem
                            key={s}
                            checked={headerFilters.status.includes(s)}
                            onCheckedChange={() => {
                              emitFilterIntent("header_status", s);
                              toggleHeaderFilter("status", s);
                            }}
                          >
                            {s}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody ref={tbodyRef} data-testid="task-list-body" />
          </table>
          {/*
            Always-visible state surface — one of {loading, error, empty}
            renders whenever the controller hasn't attached row elements
            yet. Previously only the empty state rendered, and it was
            gated on `!isLoading`, which meant an `offlineFirst` + no
            `refetchOnWindowFocus` combination could leave the view with
            zero rows and zero feedback.
          */}
          {isError ? (
            <div
              className="py-10 text-center text-destructive text-sm"
              role="alert"
              data-testid="task-list-error"
            >
              <p className="font-medium">Couldn't load your tasks.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(error as Error | null)?.message ?? "Please try again."}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent"
                data-testid="task-list-error-retry"
              >
                Retry
              </button>
            </div>
          ) : isLoading && visibleTasks.length === 0 ? (
            <div
              className="py-10 text-center text-muted-foreground text-sm"
              data-testid="task-list-loading"
            >
              Loading tasks…
            </div>
          ) : visibleTasks.length === 0 ? (
            <div
              className="py-10 text-center text-muted-foreground text-sm"
              data-testid="task-list-empty"
            >
              {tasks.length === 0 ? copy.emptyZero : copy.emptyNoResults}
            </div>
          ) : null}
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
              {/* List reads no longer carry `classificationAssociations`
               * (slim DTO). Delegate to a lazy detail fetcher that hits
               * GET /api/tasks/:id (still returns the full associations
               * array) so the dialog renders per-label confidence pills. */}
              <ClassifyTaskDialogBody task={classifyTask} />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default TaskListHost;
