import { TaskList } from "@/components/task-list";
import { TaskForm } from "@/components/task-form";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "wouter";

export default function Tasks() {
  const [location] = useLocation();
  const showFormFirst = useMemo(() => location.includes("new=1"), [location]);

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
              Use <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs">Ctrl+N</kbd> (Mac:{" "}
              <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs">Cmd+N</kbd>) to jump here and{" "}
              <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs">Ctrl+Enter</kbd> (Mac:{" "}
              <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs">Cmd+Enter</kbd>) to submit — click
              inside the app first so the browser does not capture the shortcut.
            </p>
          </div>
        </CardContent>
      </Card>

      {showFormFirst && <TaskForm />}
      <TaskList />
    </div>
  );
}
