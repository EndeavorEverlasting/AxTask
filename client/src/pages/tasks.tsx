import { TaskListHost } from "@/components/task-list-host";
import { TaskForm } from "@/components/task-form";
import { Card, CardContent } from "@/components/ui/card";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { usePretextSurface } from "@/hooks/use-pretext-surface";
import { Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Task } from "@shared/schema";

function readTaskIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("task");
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export default function Tasks() {
  const [showForm, setShowForm] = useState(false);
  const [, setLocation] = useLocation();
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(() => readTaskIdFromLocation());

  /* Task list is a heavy grid — dim the ambient orb layer while this page
   * is in view so the data remains the focal point. */
  usePretextSurface("dense");

  useEffect(() => {
    const onOpen = () => setShowForm(true);
    window.addEventListener("axtask-open-new-task", onOpen);
    return () => window.removeEventListener("axtask-open-new-task", onOpen);
  }, []);

  const { data: pendingTask } = useQuery<Task>({
    queryKey: ["/api/tasks", pendingTaskId],
    enabled: !!pendingTaskId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${pendingTaskId}`);
      return (await res.json()) as Task;
    },
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!pendingTaskId || !pendingTask) return;
    window.dispatchEvent(
      new CustomEvent("axtask-open-task-edit", { detail: { task: pendingTask } }),
    );
    /* Strip the ?task= param so reloads and back navigation don't re-open the
       dialog after the user has dismissed it. */
    setPendingTaskId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    setLocation(url.pathname + (url.search || ""));
  }, [pendingTask, pendingTaskId, setLocation]);

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8">
      <PretextPageHeader
        eyebrow="Tasks"
        title="All Tasks"
        subtitle="View and manage all your tasks"
      />

      <Card className="glass-panel-glossy border border-primary/20">
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold flex items-center gap-2 text-foreground">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              Add Task is front and center
            </p>
            <p className="text-sm text-muted-foreground">
              Use <kbd className="rounded-md border border-border bg-muted/80 px-1.5 py-0.5 text-xs font-mono">Alt+N</kbd> to add a task,{" "}
              <kbd className="rounded-md border border-border bg-muted/80 px-1.5 py-0.5 text-xs font-mono">Alt+F</kbd> to find tasks,{" "}
              and <kbd className="rounded-md border border-border bg-muted/80 px-1.5 py-0.5 text-xs font-mono">Alt+T</kbd> for the dashboard.
            </p>
          </div>
        </CardContent>
      </Card>

      {showForm && <TaskForm />}
      <TaskListHost />
    </div>
  );
}
