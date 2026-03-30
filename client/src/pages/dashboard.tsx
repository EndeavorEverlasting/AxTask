import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { BarChart3, CheckCircle, AlertTriangle, ListTodo } from "lucide-react";

interface TaskStats {
  totalTasks: number;
  highPriorityTasks: number;
  completedToday: number;
  avgPriorityScore: number;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<TaskStats>({
    queryKey: ["/api/tasks/stats"],
  });

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Task Dashboard</h2>
        <p className="text-gray-600 dark:text-gray-400">Manage and prioritize your tasks efficiently</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Tasks</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {isLoading ? "..." : stats?.totalTasks || 0}
                </p>
              </div>
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
                <ListTodo className="text-primary text-xl h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">High Priority</p>
                <p className="text-3xl font-bold text-red-600">
                  {isLoading ? "..." : stats?.highPriorityTasks || 0}
                </p>
              </div>
              <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-lg">
                <AlertTriangle className="text-red-600 text-xl h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Completed Today</p>
                <p className="text-3xl font-bold text-green-600">
                  {isLoading ? "..." : stats?.completedToday || 0}
                </p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
                <CheckCircle className="text-green-600 text-xl h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Priority Score</p>
                <p className="text-3xl font-bold text-orange-600">
                  {isLoading ? "..." : stats?.avgPriorityScore || 0}
                </p>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg">
                <BarChart3 className="text-orange-600 text-xl h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Form */}
      <TaskForm />

      {/* Recent Tasks */}
      <TaskList />
    </div>
  );
}
