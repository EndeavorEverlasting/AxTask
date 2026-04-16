import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { Card, CardContent } from "@/components/ui/card";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { BarChart3, CheckCircle, AlertTriangle, ListTodo } from "lucide-react";
import { motion } from "framer-motion";
import { useCountUp, useCountUpDecimal } from "@/hooks/use-count-up";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { ImmersivePretextCue } from "@/components/layout/immersive-pretext-cue";
import { MobileChecklistWidget } from "@/components/mobile-checklist-widget";

interface TaskStats {
  totalTasks: number;
  highPriorityTasks: number;
  completedToday: number;
  avgPriorityScore: number;
}

function scoreBand(score: number): string {
  if (score >= 8) return "Critical load";
  if (score >= 6) return "High load";
  if (score >= 4) return "Moderate load";
  if (score >= 2) return "Standard load";
  return "Light load";
}

function StatCard({
  label,
  value,
  icon,
  colorClass,
  bgClass,
  index,
  reducedMotion,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
  index: number;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08 }}
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
              <p className={`text-3xl font-bold tabular-nums ${colorClass}`}>
                {value}
              </p>
            </div>
            <div className={`${bgClass} p-3 rounded-lg`}>
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<TaskStats>({
    queryKey: ["/api/tasks/stats"],
  });

  useEffect(() => {
    requestFeedbackNudge("dashboard_visit");
  }, []);

  const reducedMotion = useReducedMotion();

  const totalTasks = useCountUp(stats?.totalTasks ?? 0);
  const highPriority = useCountUp(stats?.highPriorityTasks ?? 0);
  const completedToday = useCountUp(stats?.completedToday ?? 0);
  const avgScore = useCountUpDecimal(
    typeof stats?.avgPriorityScore === "number" ? stats.avgPriorityScore : 0,
    3
  );
  const avgScoreBand = scoreBand(Number(stats?.avgPriorityScore || 0));

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8">
      <div className="space-y-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Task Dashboard</h2>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">Manage and prioritize your tasks efficiently</p>
        </div>
        <ImmersivePretextCue />
        <MobileChecklistWidget />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <StatCard
          label="Total Tasks"
          value={isLoading ? "..." : String(totalTasks)}
          icon={<ListTodo className="text-primary text-xl h-6 w-6" />}
          colorClass="text-gray-900 dark:text-gray-100"
          bgClass="bg-blue-100 dark:bg-blue-900/30"
          index={0}
          reducedMotion={reducedMotion}
        />
        <StatCard
          label="High Priority"
          value={isLoading ? "..." : String(highPriority)}
          icon={<AlertTriangle className="text-red-600 text-xl h-6 w-6" />}
          colorClass="text-red-600"
          bgClass="bg-red-100 dark:bg-red-900/30"
          index={1}
          reducedMotion={reducedMotion}
        />
        <StatCard
          label="Completed Today"
          value={isLoading ? "..." : String(completedToday)}
          icon={<CheckCircle className="text-green-600 text-xl h-6 w-6" />}
          colorClass="text-green-600"
          bgClass="bg-green-100 dark:bg-green-900/30"
          index={2}
          reducedMotion={reducedMotion}
        />
        <StatCard
          label="Avg priority (0–10)"
          value={isLoading ? "..." : avgScore}
          icon={<BarChart3 className="text-orange-600 text-xl h-6 w-6" />}
          colorClass="text-orange-600"
          bgClass="bg-orange-100 dark:bg-orange-900/30"
          index={3}
          reducedMotion={reducedMotion}
        />
      </div>
      <p className="text-xs text-muted-foreground -mt-2 max-w-3xl">
        This is the same scale as the task list &quot;Priority (0–10)&quot; column: stored priority score in the database is ×10, then averaged and shown here as engine units (typically under ~12). Load band: {avgScoreBand}.
      </p>

      <TaskForm />

      <TaskList />
    </div>
  );
}
