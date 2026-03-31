import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Task } from "@shared/schema";

export default function Analytics() {
  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const analytics = {
    byPriority: tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    
    byClassification: tasks.reduce((acc, task) => {
      acc[task.classification] = (acc[task.classification] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    
    byStatus: tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    
    completionRate: tasks.length > 0 
      ? Math.round((tasks.filter(t => t.status === "completed").length / tasks.length) * 100)
      : 0,
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h2>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">Task distribution and performance metrics</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4 md:p-6">
                <div className="h-32 bg-gray-200 dark:bg-gray-700 animate-pulse rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">Task distribution and performance metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Priority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Priority Distribution</CardTitle>
            <CardDescription>Tasks by priority level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.byPriority).map(([priority, count]) => (
                <div key={priority} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{priority}</span>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-16">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${(count / tasks.length) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-8">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Classification Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Task Classification</CardTitle>
            <CardDescription>Tasks by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.byClassification).map(([classification, count]) => (
                <div key={classification} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{classification}</span>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-16">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${(count / tasks.length) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-8">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Task Status</CardTitle>
            <CardDescription>Current task states</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{status.replace("-", " ")}</span>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 w-16">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(count / tasks.length) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-8">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Completion Rate */}
        <Card>
          <CardHeader>
            <CardTitle>Completion Rate</CardTitle>
            <CardDescription>Overall task completion</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600 mb-2">
                {analytics.completionRate}%
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {tasks.filter(t => t.status === "completed").length} of {tasks.length} tasks completed
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Average Priority Score */}
        <Card>
          <CardHeader>
            <CardTitle>Average Priority Score</CardTitle>
            <CardDescription>Mean priority across all tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-4xl font-bold text-orange-600 mb-2">
                {tasks.length > 0 
                  ? (tasks.reduce((sum, task) => sum + task.priorityScore, 0) / tasks.length / 10).toFixed(3)
                  : "0.0"
                }
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Priority score range: 0.0 - 10.0
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Task Volume Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Tasks created in the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">
                {tasks.filter(task => {
                  const taskDate = new Date(task.createdAt!);
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return taskDate >= weekAgo;
                }).length}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                New tasks this week
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
