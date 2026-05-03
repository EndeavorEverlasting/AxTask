import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import type { Task } from "@shared/schema";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { apiRequest } from "@/lib/queryClient";

export default function TrashPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks/trash"],
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/tasks/${id}/restore`);
      if (!res.ok) throw new Error("Restore failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      toast({ title: "Task restored" });
    },
    onError: () => {
      toast({ title: "Restore failed", variant: "destructive" });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/tasks/${id}/purge`);
      if (!res.ok) throw new Error("Purge failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/trash"] });
      setConfirmPurgeId(null);
      toast({ title: "Task permanently deleted" });
    },
    onError: () => {
      toast({ title: "Purge failed", variant: "destructive" });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8 max-w-4xl mx-auto">
      <PretextPageHeader
        eyebrow="Trash"
        title="Deleted Tasks"
        subtitle="Tasks moved here can be restored or permanently purged."
      />

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading trash...
        </div>
      )}

      {!isLoading && tasks.length === 0 && (
        <Card className="glass-panel-glossy border-border/40">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Trash2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>Trash is empty.</p>
          </CardContent>
        </Card>
      )}

      {tasks.map((task) => (
        <Card key={task.id} className="glass-panel-glossy border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">{task.activity}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="text-sm text-muted-foreground">
              <span className="inline-block mr-4">Date: {task.date}</span>
              {task.deletedAt && (
                <span className="inline-block">
                  Deleted: {new Date(task.deletedAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => restoreMutation.mutate(task.id)}
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Restore
              </Button>

              {confirmPurgeId === task.id ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600 font-medium">Permanently delete?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => purgeMutation.mutate(task.id)}
                    disabled={purgeMutation.isPending}
                  >
                    {purgeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1" />
                    )}
                    Purge
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmPurgeId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={() => setConfirmPurgeId(task.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Purge
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
