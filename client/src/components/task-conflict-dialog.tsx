import { useEffect, useState } from "react";
import {
  TASK_CONFLICT_EVENT,
  abortConflictDialog,
  getPendingConflictDetail,
  submitConflictChoice,
  type TaskConflictDetail,
} from "@/lib/task-conflict-deferred";
import type { Task } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function fieldLine(label: string, value: string) {
  return (
    <div className="text-xs sm:text-sm">
      <span className="font-medium text-muted-foreground">{label}: </span>
      <span className="break-words">{value}</span>
    </div>
  );
}

function taskSummary(t: Task) {
  return (
    <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-left">
      {fieldLine("Activity", t.activity)}
      {fieldLine("Date", t.date)}
      {fieldLine("Status", t.status)}
      {t.notes ? fieldLine("Notes", t.notes.slice(0, 200) + (t.notes.length > 200 ? "…" : "")) : null}
    </div>
  );
}

/**
 * Phase C: modal when server reports task_conflict (concurrent edit / sync replay).
 */
export function TaskConflictDialog() {
  const [detail, setDetail] = useState<TaskConflictDetail | null>(null);

  useEffect(() => {
    const fn = (e: Event) => {
      const ce = e as CustomEvent<TaskConflictDetail>;
      setDetail(ce.detail);
    };
    window.addEventListener(TASK_CONFLICT_EVENT, fn);
    return () => {
      if (getPendingConflictDetail() !== null) {
        abortConflictDialog();
      }
      window.removeEventListener(TASK_CONFLICT_EVENT, fn);
    };
  }, []);

  const close = (choice: "server" | "local" | "both") => {
    submitConflictChoice(choice);
    setDetail(null);
  };

  return (
    <Dialog open={!!detail} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Task changed elsewhere</DialogTitle>
          <DialogDescription>
            This task was updated on the server or another device. Choose how to proceed.
          </DialogDescription>
        </DialogHeader>
        {detail ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {detail.kind === "delete"
                ? "You deleted it here, but the server still has this version:"
                : "Server version:"}
            </p>
            {taskSummary(detail.serverTask)}
            {detail.kind === "update" && detail.localPatch && Object.keys(detail.localPatch).length > 0 ? (
              <div className="text-xs text-muted-foreground">
                Your pending changes include:{" "}
                <span className="font-mono">{Object.keys(detail.localPatch).join(", ")}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" variant="default" className="w-full" onClick={() => close("server")}>
            Use server version
          </Button>
          <Button type="button" variant="secondary" className="w-full" onClick={() => close("local")}>
            {detail?.kind === "delete" ? "Delete anyway" : "Keep my changes"}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => close("both")}>
            Review both (refresh list)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
