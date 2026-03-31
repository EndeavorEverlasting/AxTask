import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriorityBadge } from "@/components/priority-badge";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
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
} from "lucide-react";
import type { Task } from "@shared/schema";

interface WeekDay {
  date: string;
  dayName: string;
  count: number;
  load: "none" | "light" | "moderate" | "heavy";
}

interface BriefingData {
  today: string;
  overdue: { count: number; tasks: Task[] };
  dueToday: { count: number; tasks: Task[] };
  dueWithinHour: { count: number; tasks: Task[] };
  thisWeek: { total: number; days: WeekDay[] };
  topRecommended: (Task & { reason: string })[];
  totalPending: number;
}

interface QAResponse {
  answer: string;
  relatedTasks: Task[];
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
  const reducedMotion = useReducedMotion();
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const { data: briefing, isLoading } = useQuery<BriefingData>({
    queryKey: ["/api/planner/briefing"],
    refetchInterval: 60000,
  });

  const { toast } = useToast();

  const markCompleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("PUT", `/api/tasks/${taskId}`, { id: taskId, status: "completed" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      toast({ title: "Task completed", description: "Task marked as done." });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const newDate = tomorrow.toISOString().split("T")[0];
      const res = await apiRequest("PUT", `/api/tasks/${taskId}`, { id: taskId, date: newDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task rescheduled", description: "Task moved to tomorrow." });
    },
  });

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

  const handleAsk = useCallback(() => {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    askMutation.mutate(q);
  }, [question, askMutation]);

  const todayStr = briefing?.today || new Date().toISOString().split("T")[0];
  const todayFormatted = new Date(todayStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
          <Brain className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Planner</h2>
          <p className="text-gray-500 dark:text-gray-400">{todayFormatted}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      ) : briefing ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Overdue",
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
                value: briefing.dueToday.count,
                icon: <Clock className="h-5 w-5" />,
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
              },
              {
                label: "This Week",
                value: briefing.thisWeek.total,
                icon: <CalendarDays className="h-5 w-5" />,
                color: "text-purple-600 dark:text-purple-400",
                bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
              },
              {
                label: "Total Pending",
                value: briefing.totalPending,
                icon: <TrendingUp className="h-5 w-5" />,
                color: "text-gray-700 dark:text-gray-300",
                bg: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
              >
                <Card className={`border ${stat.bg}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={stat.color}>{stat.icon}</div>
                    <div>
                      <p className={`text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2">
            {briefing.overdue.count > 0
              ? `You have ${briefing.dueToday.count} task${briefing.dueToday.count !== 1 ? "s" : ""} due today, ${briefing.overdue.count} overdue, and ${briefing.thisWeek.total} coming this week.`
              : briefing.dueToday.count > 0
                ? `You have ${briefing.dueToday.count} task${briefing.dueToday.count !== 1 ? "s" : ""} due today and ${briefing.thisWeek.total} this week. No overdue tasks!`
                : `You have ${briefing.thisWeek.total} task${briefing.thisWeek.total !== 1 ? "s" : ""} this week. Looking good!`}
          </p>

          {briefing.overdue.count > 0 && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
            >
              <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
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
            </motion.div>
          )}

          {briefing.dueWithinHour.count > 0 && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.28 }}
            >
              <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10">
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
                        <p className="text-xs text-orange-600 dark:text-orange-400">Due at {t.time}</p>
                      </div>
                      <PriorityBadge priority={t.priority} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.3 }}
            >
              <Card>
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
            </motion.div>

            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.3 }}
            >
              <Card>
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
            </motion.div>
          </div>

          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.4 }}
          >
            <Card>
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
                    <AnimatePresence mode="popLayout">
                      {chatHistory.map((msg, i) => (
                        <motion.div
                          key={i}
                          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
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
                        </motion.div>
                      ))}
                    </AnimatePresence>
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
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
