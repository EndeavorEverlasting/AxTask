import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { usePretextSurface } from "@/hooks/use-pretext-surface";
import { FloatingChip } from "@/components/ui/floating-chip";
import { TaskGantt } from "@/components/task-gantt";
import { useGanttPackUnlocked } from "@/hooks/use-gantt-pack-unlocked";
import { Link } from "wouter";
import { Lock, Sparkles } from "lucide-react";
import type { Task } from "@shared/schema";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  XAxis,
  YAxis,
} from "recharts";

type AnalyticsOverview = {
  taskMetrics: {
    total: number;
    completionCount: number;
    completionRate: number;
    byPriority: Record<string, number>;
    byClassification: Record<string, number>;
    byStatus: Record<string, number>;
  };
  completionTrend: Array<{ date: string; completed: number }>;
  graphParameters: Array<{
    key: string;
    label: string;
    value: number;
    rationale: string;
    band: "low" | "medium" | "high";
  }>;
  feedbackInsights: {
    total: number;
    byPriority: Record<string, number>;
    byClassification: Record<string, number>;
    bySentiment: Record<string, number>;
    urgentCount: number;
  };
};

export default function Analytics() {
  /* Chart-heavy surface: dim the ambient orb layer so the data reads cleanly. */
  usePretextSurface("dense");

  const { data, isLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
    staleTime: 60_000,
  });

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    staleTime: 30_000,
  });
  const ganttPack = useGanttPackUnlocked();

  if (isLoading || !data) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <PretextPageHeader
          eyebrow="Analytics"
          title="Analytics"
          subtitle="Agent-driven productivity, feedback insights, and task performance metrics"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="glass-panel-glossy">
              <CardContent className="p-4 md:p-6">
                <div className="h-32 md:h-40 bg-white/5 animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const priorityData = Object.entries(data.taskMetrics.byPriority).map(([name, value]) => ({ name, value }));
  const feedbackPriorityData = Object.entries(data.feedbackInsights.byPriority).map(([name, value]) => ({ name, value }));

  return (
    <div className="relative p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Ambient Gantt background: user's own upcoming tasks teased under the KPIs.
          pointer-events-none so it can't swallow clicks on the cards above it. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-24 md:top-28 bottom-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <TaskGantt
            tasks={allTasks}
            unlocked={ganttPack.unlocked}
            rangeDays={28}
            dimmed
            className="blur-[1.5px]"
            emptyHint=""
          />
        </div>
        {/* Fade-to-transparent bottom so the chart doesn't collide with the footer edge. */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="relative">
        <PretextPageHeader
          eyebrow="Analytics"
          title="Analytics"
          subtitle="Completed tasks flow into a web graph, with agent-classified parameters, feedback prioritization, and performance metrics."
          chips={
            <>
              <FloatingChip tone="neutral">Web graph</FloatingChip>
              <FloatingChip tone="success">Live metrics</FloatingChip>
              {ganttPack.unlocked ? (
                <FloatingChip tone="success">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Gantt unlocked
                  </span>
                </FloatingChip>
              ) : (
                <Link href="/rewards?tab=shop" className="inline-block" aria-label="Unlock Gantt customization in Rewards">
                  <FloatingChip tone="warning">
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Unlock Gantt
                    </span>
                  </FloatingChip>
                </Link>
              )}
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="glass-panel-glossy">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{data.taskMetrics.completionRate}%</div>
            <p className="text-sm text-muted-foreground">
              {data.taskMetrics.completionCount} of {data.taskMetrics.total} tasks completed
            </p>
          </CardContent>
        </Card>
        <Card className="glass-panel-glossy">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feedback Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{data.feedbackInsights.total}</div>
            <p className="text-sm text-muted-foreground">Processed feedback submissions</p>
          </CardContent>
        </Card>
        <Card className="glass-panel-glossy">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Urgent Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{data.feedbackInsights.urgentCount}</div>
            <p className="text-sm text-muted-foreground">High + critical items requiring attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="glass-panel-glossy">
          <CardHeader>
            <CardTitle>Completed Tasks Trend</CardTitle>
            <CardDescription>Daily completion totals for the last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px] w-full"
              config={{ completed: { label: "Completed", color: "#22c55e" } }}
            >
              <LineChart data={data.completionTrend}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="glass-panel-glossy">
          <CardHeader>
            <CardTitle>Agent Web Graph</CardTitle>
            <CardDescription>Agent-classified performance dimensions from completed task behavior</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px] w-full"
              config={{ value: { label: "Score", color: "#14b8a6" } }}
            >
              <RadarChart data={data.graphParameters}>
                <PolarGrid />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(_, __, item) => {
                        const payload = item?.payload as { label: string; value: number; rationale: string; band: string };
                        return (
                          <div className="space-y-1">
                            <div className="font-medium">{payload.label}: {payload.value}% ({payload.band})</div>
                            <div className="text-xs text-muted-foreground">{payload.rationale}</div>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Radar dataKey="value" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.35} />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="glass-panel-glossy">
          <CardHeader>
            <CardTitle>Task Priority Distribution</CardTitle>
            <CardDescription>How work is classified by priority levels</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px] w-full"
              config={{ value: { label: "Tasks", color: "#3b82f6" } }}
            >
              <BarChart data={priorityData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="glass-panel-glossy">
          <CardHeader>
            <CardTitle>Feedback Prioritization</CardTitle>
            <CardDescription>Agent-prioritized feedback queue by severity</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px] w-full"
              config={{ value: { label: "Feedback", color: "#f97316" } }}
            >
              <BarChart data={feedbackPriorityData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

