import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import type { Task } from "@shared/schema";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { TaskGanttWorkspace } from "@/components/gantt/task-gantt-workspace";
import { useGanttPackUnlocked } from "@/hooks/use-gantt-pack-unlocked";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export default function PlannerTimelinePage() {
  const search = useSearch();
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    staleTime: 30_000,
  });
  const ganttPack = useGanttPackUnlocked();

  const bundleId = useMemo(() => {
    try {
      const raw = new URLSearchParams(search).get("bundle")?.trim() ?? "";
      return /^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/i.test(raw)
        ? raw
        : "";
    } catch {
      return "";
    }
  }, [search]);

  const { data: bundlePrefilter } = useQuery({
    queryKey: ["/api/conversion-artifacts", bundleId],
    enabled: Boolean(bundleId),
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/conversion-artifacts/${bundleId}`);
      if (!r.ok) throw new Error("bundle");
      return (await r.json()) as { tasks: Task[] };
    },
  });

  const bundleMemberIds = useMemo(
    () => new Set(bundlePrefilter?.tasks.map((t) => t.id) ?? []),
    [bundlePrefilter],
  );

  const scopedTasks = useMemo(() => {
    if (!bundleId || bundleMemberIds.size === 0) return tasks;
    return tasks.filter((t) => bundleMemberIds.has(t.id));
  }, [tasks, bundleId, bundleMemberIds]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <PretextPageHeader
        eyebrow="Planner"
        title="Timeline workspace"
        subtitle={
          bundleId
            ? "Filtered to tasks from the selected bundle. Pan and zoom inside the viewport."
            : "Pan and zoom inside a fixed viewport. Use the minimap to stay oriented. Click a bar to inspect the task."
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/planner">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to AI Planner
            </Link>
          </Button>
        }
      />
      <TaskGanttWorkspace tasks={scopedTasks} unlocked={ganttPack.unlocked} />
    </div>
  );
}
