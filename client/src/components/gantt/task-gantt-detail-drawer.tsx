import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { Task } from "@shared/schema";
import { ExternalLink, CheckCircle } from "lucide-react";
import { syncUpdateTask, TaskSyncAbortedError } from "@/lib/task-sync-api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export interface TaskGanttDetailDrawerProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskGanttDetailDrawer({ task, open, onOpenChange }: TaskGanttDetailDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const openInTasks = () => {
    if (!task) return;
    onOpenChange(false);
    window.dispatchEvent(new CustomEvent("axtask-open-task-edit", { detail: { task } }));
  };

  const markComplete = async () => {
    if (!task) return;
    try {
      await syncUpdateTask(task.id, { status: "completed" }, task, queryClient);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task completed" });
      onOpenChange(false);
    } catch (e) {
      if (e instanceof TaskSyncAbortedError) return;
      toast({ title: "Could not update task", variant: "destructive" });
    }
  };

  if (!task) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="text-left leading-snug">{task.activity}</DrawerTitle>
          <p className="text-xs text-muted-foreground text-left capitalize">
            {task.classification} · {task.priority} · {task.status.replace("-", " ")}
          </p>
        </DrawerHeader>
        <div className="px-4 pb-2 text-sm text-muted-foreground max-h-[40vh] overflow-y-auto">
          {task.notes ? <p className="whitespace-pre-wrap">{task.notes}</p> : <p className="italic">No notes</p>}
        </div>
        <DrawerFooter className="flex-row flex-wrap gap-2">
          <Button type="button" variant="default" size="sm" onClick={openInTasks}>
            <ExternalLink className="h-4 w-4 mr-1" aria-hidden />
            Edit in Tasks
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={markComplete} disabled={task.status === "completed"}>
            <CheckCircle className="h-4 w-4 mr-1" aria-hidden />
            Complete
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
