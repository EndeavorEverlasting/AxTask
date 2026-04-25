import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isBrowserOnline, syncUpdateTask, TaskSyncAbortedError } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";
import { useVoice } from "@/hooks/use-voice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriorityBadge } from "@/components/priority-badge";
import type { ProposedAction } from "@/components/bulk-action-dialog";

/* BulkActionDialog owns a large framer-motion AnimatePresence subtree.
 * It only mounts once the user has sent a review phrase AND the server
 * has matched at least one task; until then we keep its JS out of the
 * planner chunk entirely. */
const BulkActionDialog = lazy(() => import("@/components/bulk-action-dialog"));
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Brain,
  Send,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Loader2,
  CheckSquare,
  CalendarClock,
  Users,
  Mic,
  ClipboardCheck,
  Repeat,
  BarChart3,
  Lightbulb,
  RefreshCw,
  Lock,
  ShoppingCart,
} from "lucide-react";
import type { Task } from "@shared/schema";
import { sendProductFunnelBeacon } from "@/lib/product-funnel-beacon";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { FloatingChip } from "@/components/ui/floating-chip";
import {
  buildTaskListHref,
  type TaskListRouteFilter,
} from "@/lib/task-list-route-filters";
import { useBriefing } from "@/hooks/use-briefing";
import type { BriefingData } from "@/hooks/use-briefing";
import { TaskGantt } from "@/components/task-gantt";
import { useGanttPackUnlocked } from "@/hooks/use-gantt-pack-unlocked";
import { isShoppingTask } from "@shared/shopping-tasks";
import { useAuth } from "@/lib/auth-context";
import {
  buildLocalMarkovInsights,
  loadLocalCompletionLedger,
  mergePlannerInsights,
  type LocalMarkovInsight,
} from "@/lib/local-markov-predictions";

interface QAResponse {
  answer: string;
  relatedTasks: Task[];
}

interface AiExecuteResponse {
  type: "action_result" | "clarification";
  action?: "create_reminder";
  message?: string;
  clarification?: string;
  reason?: string;
}

const LOAD_COLORS: Record<string, string> = {
  none: "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500",
  light: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  moderate: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  heavy: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
};

const SUGGESTED_QUESTIONS = [
  "What's most urgent?",
  "What's due today?",
  "Show overdue tasks",
  "Summarize my week",
];

export default function PlannerPage() {
  const [, setLocation] = useLocation();
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [aiMessage, setAiMessage] = useState("");
  const [aiChatHistory, setAiChatHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [reviewInput, setReviewInput] = useState("");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewActions, setReviewActions] = useState<ProposedAction[]>([]);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewUnmatched, setReviewUnmatched] = useState<string[]>([]);
  const voice = useVoice();
  const { toast } = useToast();

  useEffect(() => {
    sendProductFunnelBeacon("planner_viewed");
  }, []);

  const { data: briefing, isLoading } = useBriefing();
  const { user } = useAuth();

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    staleTime: 30_000,
  });
  const ganttPack = useGanttPackUnlocked();

  interface PatternInsight {
    type: "topic" | "recurrence" | "deadline_rhythm" | "similarity_cluster" | "markov_local";
    title: string;
    description: string;
    confidence: number;
    taskIds?: string[];
    data: Record<string, unknown>;
  }

  const [localMarkovInsights, setLocalMarkovInsights] = useState<LocalMarkovInsight[]>([]);

  useEffect(() => {
    let cancelled = false;
    const uid = user?.id ?? allTasks[0]?.userId ?? "";
    if (!uid) {
      setLocalMarkovInsights([]);
      return;
    }
    void loadLocalCompletionLedger(uid).then((ledger) => {
      if (cancelled) return;
      const pending = allTasks.filter((t) => t.status !== "completed");
      setLocalMarkovInsights(buildLocalMarkovInsights(uid, pending, allTasks, ledger));
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, allTasks]);

  const handleInsightClick = useCallback(
    (insight: PatternInsight) => {
      const firstId = insight.taskIds?.[0];
      if (firstId) {
        setLocation(`/tasks?task=${encodeURIComponent(firstId)}`);
        return;
      }
      const dataActivities =
        typeof insight.data === "object" && insight.data
          ? ((insight.data as { activities?: unknown; recentActivities?: unknown; activity?: unknown; topic?: unknown }))
          : {};
      const fallbackQuery = (() => {
        if (Array.isArray(dataActivities.activities) && typeof dataActivities.activities[0] === "string") {
          return dataActivities.activities[0] as string;
        }
        if (Array.isArray(dataActivities.recentActivities) && typeof dataActivities.recentActivities[0] === "string") {
          return dataActivities.recentActivities[0] as string;
        }
        if (typeof dataActivities.activity === "string") return dataActivities.activity;
        if (typeof dataActivities.topic === "string") return dataActivities.topic;
        return insight.title;
      })();
      setLocation("/tasks");
      window.dispatchEvent(
        new CustomEvent("axtask-focus-task-search", { detail: { query: fallbackQuery } }),
      );
    },
    [setLocation],
  );

  const { data: patternData, isLoading: patternsLoading } = useQuery<{
    insights: PatternInsight[];
    patternCount: number;
  }>({
    queryKey: ["/api/patterns/insights"],
    refetchInterval: 120000,
  });

  const mergedPlannerInsights = useMemo(
    () => mergePlannerInsights(localMarkovInsights, patternData?.insights ?? [], 8) as PatternInsight[],
    [patternData?.insights, localMarkovInsights],
  );

  const learnMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/patterns/learn", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patterns/insights"] });
      toast({
        title: "Patterns updated",
        description: `Analyzed your tasks and found ${data.learned} patterns.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to analyze patterns.", variant: "destructive" });
    },
  });

  const markCompleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const tasks = queryClient.getQueryData<Task[]>(["/api/tasks"]) ?? [];
      const base = tasks.find((t) => t.id === taskId);
      if (!base) {
        if (!isBrowserOnline()) {
          throw new Error(
            "Cannot save changes offline without the latest task data. Connect or refresh tasks, then try again.",
          );
        }
        throw new Error("Task not in cache. Refresh your task list and try again.");
      }
      return syncUpdateTask(taskId, { id: taskId, status: "completed" }, base, queryClient);
    },
    onSuccess: (data) => {
      const d = data as { offlineQueued?: boolean } | undefined;
      if (d?.offlineQueued) {
        toast({ title: "Saved offline", description: "Will sync when you're back online." });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      toast({ title: "Task completed", description: "Task marked as done." });
    },
    onError: (e: unknown) => {
      if (e instanceof TaskSyncAbortedError) return;
      toast({ title: "Error", description: "Could not update task.", variant: "destructive" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const newDate = tomorrow.toISOString().split("T")[0];
      const tasks = queryClient.getQueryData<Task[]>(["/api/tasks"]) ?? [];
      const base = tasks.find((t) => t.id === taskId);
      if (!base) {
        if (!isBrowserOnline()) {
          throw new Error(
            "Cannot save changes offline without the latest task data. Connect or refresh tasks, then try again.",
          );
        }
        throw new Error("Task not in cache. Refresh your task list and try again.");
      }
      return syncUpdateTask(taskId, { id: taskId, date: newDate }, base, queryClient);
    },
    onSuccess: (data) => {
      const d = data as { offlineQueued?: boolean } | undefined;
      if (d?.offlineQueued) {
        toast({ title: "Saved offline", description: "Will sync when you're back online." });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task rescheduled", description: "Task moved to tomorrow." });
    },
    onError: (e: unknown) => {
      if (e instanceof TaskSyncAbortedError) return;
      toast({ title: "Error", description: "Could not reschedule task.", variant: "destructive" });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (transcript: string) => {
      const res = await apiRequest("POST", "/api/tasks/review", { transcript });
      return res.json() as Promise<{ actions: ProposedAction[]; unmatched: string[]; message: string }>;
    },
    onSuccess: (data) => {
      if (data.actions.length > 0) {
        setReviewActions(data.actions);
        setReviewMessage(data.message);
        setReviewUnmatched(data.unmatched);
        setReviewDialogOpen(true);
        setReviewInput("");
      } else {
        toast({
          title: "No matches",
          description: data.message,
        });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to process review. Try again.", variant: "destructive" });
    },
  });

  const handleReview = useCallback(() => {
    const text = reviewInput.trim();
    if (!text) return;
    reviewMutation.mutate(text);
  }, [reviewInput, reviewMutation]);

  const askMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/planner/ask", { question: q });
      return res.json() as Promise<QAResponse>;
    },
    onSuccess: (data, q) => {
      setChatHistory(prev => [
        ...prev,
        { role: "user", text: q },
        { role: "assistant", text: data.answer },
      ]);
    },
  });

  const aiExecuteMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/ai/execute", { message });
      return res.json() as Promise<AiExecuteResponse>;
    },
    onSuccess: (data, message) => {
      const assistantText =
        data.type === "action_result"
          ? (data.message || "Done.")
          : `Need clarification: ${data.clarification || "Please provide more details."}`;
      setAiChatHistory((prev) => [
        ...prev,
        { role: "user", text: message },
        { role: "assistant", text: assistantText },
      ]);
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
    },
    onError: (error: unknown) => {
      const text = error instanceof Error ? error.message : "Failed to process reminder chat.";
      toast({
        title: "Gentle Reminder chat unavailable",
        description: text,
        variant: "destructive",
      });
    },
  });

  const grocerySuggestMutation = useMutation({
    mutationFn: async (applyOptInAutomation: boolean) => {
      const res = await apiRequest("POST", "/api/grocery-reminders/suggest", { applyOptInAutomation });
      return res.json() as Promise<{
        suggestions: BriefingData["shopping"]["repurchaseSuggestions"];
        automation: {
          taskCreated: number;
          notificationQueued: number;
        };
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
      const parts: string[] = [];
      if ((data.automation.taskCreated ?? 0) > 0) {
        parts.push(`created ${data.automation.taskCreated} task(s)`);
      }
      if ((data.automation.notificationQueued ?? 0) > 0) {
        parts.push(`queued ${data.automation.notificationQueued} nudge(s)`);
      }
      toast({
        title: "Grocery suggestions refreshed",
        description:
          parts.length > 0
            ? `Opt-in automation ${parts.join(" and ")}.`
            : "Latest grocery repurchase suggestions are now in your planner.",
      });
    },
    onError: () => {
      toast({
        title: "Could not refresh grocery suggestions",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handleAsk = useCallback(() => {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    askMutation.mutate(q);
  }, [question, askMutation]);

  const handleAiExecute = useCallback(() => {
    const message = aiMessage.trim();
    if (!message) return;
    setAiMessage("");
    aiExecuteMutation.mutate(message);
  }, [aiMessage, aiExecuteMutation]);

  const todayStr = briefing?.today || new Date().toISOString().split("T")[0];
  const todayFormatted = new Date(todayStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const isShoppingLike = useCallback(
    (task: Task) =>
      isShoppingTask({
        classification: task.classification,
        activity: task.activity,
        notes: task.notes,
      }),
    [],
  );

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8 max-w-5xl mx-auto">
      <PretextPageHeader
        eyebrow="AI Planner"
        title={
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/25">
              <Brain className="h-5 w-5" />
            </span>
            AI Planner
          </span>
        }
        subtitle={todayFormatted}
        chips={
          <>
            <FloatingChip tone="neutral">Pattern-aware</FloatingChip>
            <FloatingChip tone="success">Weekly rhythm</FloatingChip>
          </>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      ) : briefing ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              {
                label: "Overdue",
                filter: "overdue" as const satisfies TaskListRouteFilter,
                value: briefing.overdue.count,
                icon: <AlertTriangle className="h-5 w-5" />,
                color: briefing.overdue.count > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-400 dark:text-gray-500",
                bg: briefing.overdue.count > 0
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
              },
              {
                label: "Due Today",
                filter: "today" as const satisfies TaskListRouteFilter,
                value: briefing.dueToday.count,
                icon: <Clock className="h-5 w-5" />,
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
              },
              {
                label: "Week Total",
                filter: "week" as const satisfies TaskListRouteFilter,
                value: briefing.thisWeek.total,
                icon: <CalendarDays className="h-5 w-5" />,
                color: "text-purple-600 dark:text-purple-400",
                bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
              },
              {
                label: "Total Pending",
                filter: "pending" as const satisfies TaskListRouteFilter,
                value: briefing.totalPending,
                icon: <TrendingUp className="h-5 w-5" />,
                color: "text-gray-700 dark:text-gray-300",
                bg: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
              },
            ] satisfies {
              label: string;
              filter: TaskListRouteFilter;
              value: number;
              icon: JSX.Element;
              color: string;
              bg: string;
            }[]).map((stat) => (
              /* Plain button + CSS fade-in (no framer-motion). Tiles
               * need one-shot entrance animation, not a persistent
               * MotionValue observer — CSS keyframes cost us zero JS
               * heap on every re-render. Reduced-motion users get the
               * `motion-reduce:` no-op variant automatically. */
              <button
                key={stat.label}
                type="button"
                onClick={() => setLocation(buildTaskListHref(stat.filter))}
                aria-label={`Open ${stat.label} tasks in All Tasks`}
                data-testid={`planner-tile-${stat.filter}`}
                className="axtask-fade-in-up w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Card
                  className={`border ${stat.bg} transition-colors hover:brightness-[1.02]`}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={stat.color}>{stat.icon}</div>
                    <div>
                      <p
                        className={`text-2xl font-bold tabular-nums ${stat.color}`}
                      >
                        {stat.value}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {stat.label}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2">
            {briefing.overdue.count > 0
              ? `You have ${briefing.dueToday.count} task${briefing.dueToday.count !== 1 ? "s" : ""} due today, ${briefing.overdue.count} overdue, and ${briefing.thisWeek.total} total this week.`
              : briefing.dueToday.count > 0
                ? `You have ${briefing.dueToday.count} task${briefing.dueToday.count !== 1 ? "s" : ""} due today and ${briefing.thisWeek.total} total this week. No overdue tasks!`
                : `You have ${briefing.thisWeek.total} task${briefing.thisWeek.total !== 1 ? "s" : ""} this week. Looking good!`}
          </p>

          <div id="gantt">
            <Card className="axtask-stable-panel border-gray-200 dark:border-gray-800 overflow-hidden">
              <CardHeader className="pb-3 border-b border-gray-200/80 dark:border-gray-800/80 bg-slate-950/30 dark:bg-slate-900/40">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-500" />
                    Task Timeline
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                      · Gantt view of scheduled work
                    </span>
                  </CardTitle>
                  {ganttPack.unlocked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <Sparkles className="h-3 w-3" />
                      {ganttPack.reason === "avatar-level" ? "Unlocked via avatar" : "Unlocked"}
                    </span>
                  ) : (
                    <Link
                      href="/rewards?tab=shop"
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
                    >
                      <Lock className="h-3 w-3" />
                      Customize (avatar L{3}+ or 250 AxCoins)
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="w-full min-w-0 rounded-lg border border-white/10 bg-black/10 p-2">
                  <TaskGantt
                    tasks={allTasks}
                    unlocked={ganttPack.unlocked}
                    rangeDays={21}
                    emptyHint="Schedule a task with a date to see it on the timeline."
                  />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {ganttPack.unlocked
                    ? "Swimlanes group by classification, bars are colored by priority, and arrows follow task dependencies."
                    : "Free preview — bars are colored by status. Unlock the Gantt Timeline Pack in the Rewards shop for swimlanes, dependency arrows, and priority coloring."}
                </p>
              </CardContent>
            </Card>
          </div>

          {briefing.overdue.count > 0 && (
            <div className="axtask-stable-panel">
              <Card className="axtask-stable-panel border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    Overdue Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {briefing.overdue.tasks.map(t => (
                    <div
                      key={t.id}
                      className="p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-red-100 dark:border-red-900/30"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.activity}</p>
                          {isShoppingLike(t) ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                              <ShoppingCart className="h-2.5 w-2.5" />
                              Shopping
                            </span>
                          ) : null}
                          <p className="text-xs text-red-500">Was due {t.date}</p>
                        </div>
                        <PriorityBadge priority={t.priority} score={(t.priorityScore || 0) / 10} />
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20"
                          onClick={() => markCompleteMutation.mutate(t.id)}
                          disabled={markCompleteMutation.isPending}
                        >
                          <CheckSquare className="h-3 w-3 mr-1" />
                          Complete
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          onClick={() => rescheduleMutation.mutate(t.id)}
                          disabled={rescheduleMutation.isPending}
                        >
                          <CalendarClock className="h-3 w-3 mr-1" />
                          Reschedule
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                          onClick={() => {
                            toast({
                              title: "Delegate task",
                              description: `Share "${t.activity}" with your team to delegate it.`,
                            });
                          }}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          Delegate
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {briefing.dueWithinHour.count > 0 && (
            <div className="axtask-stable-panel">
              <Card className="axtask-stable-panel border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-orange-700 dark:text-orange-400">
                    <Clock className="h-4 w-4" />
                    Due Within the Hour
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {briefing.dueWithinHour.tasks.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-orange-100 dark:border-orange-900/30"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.activity}</p>
                        {isShoppingLike(t) ? (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                            <ShoppingCart className="h-2.5 w-2.5" />
                            Shopping
                          </span>
                        ) : null}
                        <p className="text-xs text-orange-600 dark:text-orange-400">Due at {t.time}</p>
                      </div>
                      <PriorityBadge priority={t.priority} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="axtask-stable-panel">
            <Card className="axtask-stable-panel border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-900/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <ShoppingCart className="h-4 w-4" />
                  Grocery / Shopping
                  <span className="ml-auto text-xs font-normal text-emerald-600/80 dark:text-emerald-400/80">
                    {briefing.shopping.count} active
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Link href="/shopping">
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Open shopping list
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-emerald-300 dark:border-emerald-700"
                    disabled={grocerySuggestMutation.isPending}
                    onClick={() => grocerySuggestMutation.mutate(false)}
                  >
                    Refresh suggestions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-emerald-300 dark:border-emerald-700"
                    disabled={grocerySuggestMutation.isPending}
                    onClick={() => grocerySuggestMutation.mutate(true)}
                  >
                    Apply opt-in automation
                  </Button>
                </div>

                {briefing.shopping.repurchaseSuggestions.length > 0 ? (
                  <div className="space-y-2">
                    {briefing.shopping.repurchaseSuggestions.slice(0, 4).map((s) => (
                      <div
                        key={`${s.item}-${s.suggestedDate}`}
                        className="rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-white/70 dark:bg-gray-900/30 p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {s.item}
                          </p>
                          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                            {s.confidence}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          {s.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No grocery cadence suggestions yet. Continue checking off shopping items and planner will learn your rhythm.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="axtask-stable-panel">
              <Card className="axtask-stable-panel">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    Top Recommended
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {briefing.topRecommended.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      No pending tasks — you're all caught up!
                    </div>
                  ) : (
                    briefing.topRecommended.map((t, i) => (
                      <div
                        key={t.id}
                        className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.activity}</p>
                          {isShoppingLike(t) ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                              <ShoppingCart className="h-2.5 w-2.5" />
                              Shopping
                            </span>
                          ) : null}
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                            <ArrowRight className="h-3 w-3" />
                            {t.reason}
                          </p>
                        </div>
                        <PriorityBadge priority={t.priority} />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="axtask-stable-panel">
              <Card className="axtask-stable-panel">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    Weekly Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-2">
                    {briefing.thisWeek.days.map(day => {
                      const isToday = day.date === todayStr;
                      return (
                        <div
                          key={day.date}
                          className={`flex flex-col items-center p-2 rounded-lg transition-colors ${LOAD_COLORS[day.load]} ${isToday ? "ring-2 ring-purple-400 dark:ring-purple-500" : ""}`}
                        >
                          <span className={`text-[10px] font-semibold uppercase ${isToday ? "text-purple-600 dark:text-purple-400" : ""}`}>
                            {day.dayName}
                          </span>
                          <span className="text-lg font-bold tabular-nums mt-0.5">{day.count}</span>
                          <span className="text-[9px] capitalize opacity-70">{day.load}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> Light</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Moderate</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Heavy</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="axtask-stable-panel">
            <Card className="axtask-stable-panel border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/10 dark:to-purple-900/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-indigo-500" />
                  Quick Review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Tell us which tasks you've completed, need rescheduling, or priority changes. Type or use voice.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "I finished the ",
                    "I already did the ",
                    "Move the report to tomorrow",
                  ].map(hint => (
                    <Button
                      key={hint}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 border-indigo-200 dark:border-indigo-800"
                      onClick={() => setReviewInput(hint)}
                    >
                      {hint}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder='e.g. "I finished the dentist and groceries, move report to Friday"'
                    value={reviewInput}
                    onChange={e => setReviewInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleReview();
                      }
                    }}
                    disabled={reviewMutation.isPending}
                    className="flex-1"
                  />
                  {voice.isSupported && (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Use voice to review tasks"
                      onClick={() => {
                        voice.openBarAndToggleListening();
                      }}
                      className="shrink-0 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                      title="Use voice to review tasks"
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    onClick={handleReview}
                    disabled={!reviewInput.trim() || reviewMutation.isPending}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                  >
                    {reviewMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardCheck className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="axtask-stable-panel">
            <Card className="axtask-stable-panel border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-900/10 dark:to-teal-900/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-emerald-500" />
                  Patterns & Insights
                  <div className="ml-auto flex items-center gap-2">
                    {patternData && patternData.patternCount > 0 && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-normal">
                        {patternData.patternCount} patterns learned
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                      onClick={() => learnMutation.mutate()}
                      disabled={learnMutation.isPending}
                    >
                      {learnMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Analyze
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {patternsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                  </div>
                ) : mergedPlannerInsights.length > 0 ? (
                  <div className="space-y-3">
                    {mergedPlannerInsights.map((insight, idx) => {
                      const iconMap: Record<string, typeof Repeat> = {
                        topic: BarChart3,
                        recurrence: Repeat,
                        deadline_rhythm: CalendarClock,
                        similarity_cluster: Users,
                        markov_local: Brain,
                      };
                      const colorMap: Record<string, string> = {
                        topic: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
                        recurrence: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
                        deadline_rhythm: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
                        similarity_cluster: "text-teal-500 bg-teal-50 dark:bg-teal-900/20",
                        markov_local: "text-cyan-600 bg-cyan-50 dark:bg-cyan-900/25",
                      };
                      const InsightIcon = iconMap[insight.type] || Lightbulb;
                      const colorClass = colorMap[insight.type] || "text-gray-500 bg-gray-50 dark:bg-gray-900/20";

                      const hasTaskId = Boolean(insight.taskIds && insight.taskIds.length > 0);
                      const clickHint = hasTaskId
                        ? "Open this task"
                        : "Search tasks like this";
                      return (
                        <div
                          key={idx}
                          className="axtask-fade-in-up"
                          style={{ animationDelay: `${Math.min(idx, 10) * 40}ms` }}
                        >
                          <button
                            type="button"
                            onClick={() => handleInsightClick(insight)}
                            title={clickHint}
                            aria-label={`${insight.title}. ${clickHint}.`}
                            data-testid={`planner-insight-${insight.type}`}
                            data-has-task-id={hasTaskId ? "true" : "false"}
                            className="w-full text-left flex items-start gap-3 p-3 rounded-lg bg-white/60 dark:bg-gray-800/40 border border-emerald-100 dark:border-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 transition-colors"
                          >
                            <div className={`p-1.5 rounded-md shrink-0 ${colorClass}`}>
                              <InsightIcon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">
                                {insight.type === "markov_local" && (
                                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-cyan-700 dark:text-cyan-300 bg-cyan-100/80 dark:bg-cyan-900/40 px-1.5 py-0.5 rounded">
                                    On-device
                                  </span>
                                )}
                                <span className="truncate">{insight.title}</span>
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                {insight.description}
                              </p>
                            </div>
                            <div className="shrink-0">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                insight.confidence >= 70
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                  : insight.confidence >= 40
                                    ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                              }`}>
                                {insight.confidence}%
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Lightbulb className="h-8 w-8 text-emerald-300 dark:text-emerald-700 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No patterns detected yet. Click "Analyze" to learn from your task history, or keep using AxTask and patterns will build automatically.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="axtask-stable-panel">
            <Card className="axtask-stable-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-purple-500" />
                  Ask Your Planner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map(sq => (
                    <Button
                      key={sq}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        setQuestion(sq);
                        askMutation.mutate(sq);
                      }}
                    >
                      {sq}
                    </Button>
                  ))}
                </div>

                {chatHistory.length > 0 && (
                  <div className="space-y-3 max-h-64 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                    {chatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
                            msg.role === "user"
                              ? "bg-purple-600 text-white"
                              : "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600"
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Ask about your tasks..."
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAsk();
                      }
                    }}
                    disabled={askMutation.isPending}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleAsk}
                    disabled={!question.trim() || askMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {askMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="axtask-stable-panel">
            <Card className="axtask-stable-panel border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-900/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-violet-500" />
                  Gentle Reminder Chat (beta)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Ask in plain English to create reminders. Ambiguous prompts will ask a clarification.
                </p>

                {aiChatHistory.length > 0 && (
                  <div className="space-y-3 max-h-52 overflow-y-auto rounded-lg bg-white/70 dark:bg-gray-800/50 p-3 border border-violet-100 dark:border-violet-900/30">
                    {aiChatHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[88%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${
                            msg.role === "user"
                              ? "bg-violet-600 text-white"
                              : "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600"
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder='e.g. "Set a reminder to check my oil five minutes after I get home every day."'
                    value={aiMessage}
                    onChange={(e) => setAiMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAiExecute();
                      }
                    }}
                    disabled={aiExecuteMutation.isPending}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleAiExecute}
                    disabled={!aiMessage.trim() || aiExecuteMutation.isPending}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {aiExecuteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <div className="text-center py-16">
          <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">Unable to load your daily briefing. Please try refreshing the page.</p>
        </div>
      )}

      {reviewDialogOpen ? (
        <Suspense fallback={null}>
          <BulkActionDialog
            open={reviewDialogOpen}
            onOpenChange={setReviewDialogOpen}
            actions={reviewActions}
            message={reviewMessage}
            unmatched={reviewUnmatched}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
