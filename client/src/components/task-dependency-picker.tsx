import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Task } from "@shared/schema";
import { wouldCreateCycle, type DepGraph } from "@shared/dependency-graph";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

function buildPredGraph(tasks: Task[]): DepGraph {
  const m: DepGraph = new Map();
  for (const t of tasks) {
    m.set(t.id, Array.isArray(t.dependsOn) ? t.dependsOn.filter(Boolean) : []);
  }
  return m;
}

export interface TaskDependencyPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Task being edited — cannot depend on itself. */
  excludeTaskId?: string;
  max?: number;
  className?: string;
}

export function TaskDependencyPicker({
  value,
  onChange,
  excludeTaskId,
  max = 32,
  className,
}: TaskDependencyPickerProps) {
  const [q, setQ] = useState("");
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    staleTime: 30_000,
  });

  const graph = useMemo(() => buildPredGraph(tasks), [tasks]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);

  const suggestions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const chosen = new Set(value);
    return tasks
      .filter((t) => {
        if (excludeTaskId && t.id === excludeTaskId) return false;
        if (chosen.has(t.id)) return false;
        if (!needle) return true;
        return (
          t.activity.toLowerCase().includes(needle) ||
          (t.notes ?? "").toLowerCase().includes(needle)
        );
      })
      .slice(0, 8);
  }, [tasks, q, value, excludeTaskId]);

  const add = (id: string) => {
    if (excludeTaskId && id === excludeTaskId) return;
    if (value.includes(id)) return;
    if (value.length >= max) return;
    const nextDeps = [...value, id];
    if (excludeTaskId && wouldCreateCycle(graph, excludeTaskId, nextDeps)) return;
    onChange(nextDeps);
    setQ("");
  };

  const remove = (id: string) => {
    onChange(value.filter((x) => x !== id));
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5 min-h-[28px] mb-2">
        {value.map((id) => {
          const t = byId.get(id);
          return (
            <Badge key={id} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-[12rem] truncate">{t?.activity ?? id.slice(0, 8)}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted"
                aria-label="Remove dependency"
                onClick={() => remove(id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Search tasks to add as predecessors…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
      </div>
      {suggestions.length > 0 && q.trim().length > 0 && (
        <div className="mt-2 flex flex-col gap-1 rounded-md border border-border/60 bg-muted/30 p-2 max-w-md">
          {suggestions.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start h-auto py-1.5"
              onClick={() => add(t.id)}
            >
              <span className="truncate text-left">{t.activity}</span>
            </Button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-2">
        Up to {max} predecessors. Cycles are blocked.
      </p>
    </div>
  );
}
