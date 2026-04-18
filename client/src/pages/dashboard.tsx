import { memo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { Card, CardContent } from "@/components/ui/card";
import { FloatingChip } from "@/components/ui/floating-chip";
import { TaskForm } from "@/components/task-form";
import { BarChart3, CheckCircle, AlertTriangle, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useCountUp, useCountUpDecimal } from "@/hooks/use-count-up";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { ImmersivePretextCue } from "@/components/layout/immersive-pretext-cue";
import { MobileChecklistWidget } from "@/components/mobile-checklist-widget";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";

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

/* Memoized so the dashboard's count-up animations (which tick ~30x during the
 * intro) don't re-render every card each frame. The CSS-only rise-in
 * replaces the former framer-motion stagger — see .axtask-rise-in in
 * client/src/index.css. */
const StatCard = memo(function StatCard({
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
  const style = reducedMotion ? undefined : { animationDelay: `${index * 80}ms` };
  return (
    <div className={reducedMotion ? undefined : "axtask-rise-in"} style={style}>
      <Card className="glass-panel-glossy glass-panel-interactive">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
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
    </div>
  );
});

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
      <PretextPageHeader
        eyebrow="Dashboard"
        title="Task Dashboard"
        subtitle="Manage and prioritize your tasks efficiently"
        chips={
          <>
            <FloatingChip tone="neutral">Glass UI</FloatingChip>
            <FloatingChip tone="success">Guided flow</FloatingChip>
            <FloatingChip tone="warning">{avgScoreBand}</FloatingChip>
          </>
        }
      >
        <ImmersivePretextCue />
        <MobileChecklistWidget />
      </PretextPageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <StatCard
          label="Total Tasks"
          value={isLoading ? "..." : String(totalTasks)}
          icon={<ListTodo className="text-primary text-xl h-6 w-6" />}
          colorClass="text-foreground"
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

      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-4 md:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">All tasks</p>
            <p className="text-sm text-muted-foreground">
              Open the full list to search, filter, and reorder — kept off the dashboard so this page stays light.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/tasks">View all tasks</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
