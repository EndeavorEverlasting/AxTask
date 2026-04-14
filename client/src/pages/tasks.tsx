import { TaskList } from "@/components/task-list";
import { TaskForm } from "@/components/task-form";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useState, useEffect } from "react";

export default function Tasks() {
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const onOpen = () => setShowForm(true);
    window.addEventListener("axtask-open-new-task", onOpen);
    return () => window.removeEventListener("axtask-open-new-task", onOpen);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">All Tasks</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">View and manage all your tasks</p>
      </div>

      <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              Add Task is front and center
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Use <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs">Alt+N</kbd> to add a task,{" "}
              <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs">Alt+F</kbd> to find tasks,{" "}
              and <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs">Alt+T</kbd> for the dashboard.
            </p>
          </div>
        </CardContent>
      </Card>

      {showForm && <TaskForm />}
      <TaskList />
    </div>
  );
}
