import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { data, isLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
  });

  if (isLoading || !data) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h2>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
            Agent-driven productivity, feedback insights, and task performance metrics
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 md:p-6">
                <div className="h-32 md:h-40 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
          Completed tasks flow into a web graph, with agent-classified parameters, feedback prioritization, and performance metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <Card>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feedback Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{data.feedbackInsights.total}</div>
            <p className="text-sm text-muted-foreground">Processed feedback submissions</p>
          </CardContent>
        </Card>
        <Card>
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
        <Card>
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

        <Card>
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

        <Card>
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

        <Card>
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
