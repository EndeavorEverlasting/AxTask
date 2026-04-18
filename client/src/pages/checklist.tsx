import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfToken } from "@/lib/queryClient";
import { syncRawTaskRequest } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";
import { useImmersiveSounds } from "@/hooks/use-immersive-sounds";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download,
  Camera,
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Printer,
  ScanLine,
  ChevronLeft,
  ChevronRight,
  Coins,
} from "lucide-react";
import { postPaidDownload, triggerBlobDownload, type ProductivityExportPrices } from "@/lib/productivity-export-download";
import type { Task } from "@shared/schema";
import { AXTASK_CSRF_HEADER } from "@shared/http-auth";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { format, addDays, subDays } from "date-fns";

interface ScanResult {
  matchedTasks: {
    taskId: string;
    activity: string;
    wasChecked: boolean;
    confidence: number;
  }[];
  unmatchedLines: string[];
  rawText: string;
}

export default function ChecklistPage() {
  const { toast } = useToast();
  const { playIfEligible } = useImmersiveSounds();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [taskUpdates, setTaskUpdates] = useState<Record<string, boolean>>({});
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: exportPrices } = useQuery<ProductivityExportPrices>({
    queryKey: ["/api/gamification/productivity-export-prices"],
  });

  const { data: wallet } = useQuery<{ balance: number }>({
    queryKey: ["/api/gamification/wallet"],
  });

  const dayTasks = tasks.filter((t) => t.date === selectedDate);
  const pendingCount = dayTasks.filter((t) => t.status !== "completed").length;
  const completedCount = dayTasks.filter((t) => t.status === "completed").length;

  const scanMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("date", selectedDate);

      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers[AXTASK_CSRF_HEADER] = csrfToken;

      const res = await fetch("/api/checklist/scan", {
        method: "POST",
        body: formData,
        headers,
        credentials: "include",
      });

      if (!res.ok) throw new Error("Scan failed");
      return res.json() as Promise<ScanResult>;
    },
    onSuccess: (data) => {
      setScanResult(data);
      const initial: Record<string, boolean> = {};
      for (const match of data.matchedTasks) {
        if (match.wasChecked) {
          initial[match.taskId] = true;
        }
      }
      setTaskUpdates(initial);

      const checked = data.matchedTasks.filter((m) => m.wasChecked).length;
      toast({
        title: "Checklist scanned!",
        description: `Found ${data.matchedTasks.length} tasks, ${checked} marked as done.`,
      });
    },
    onError: () => {
      toast({
        title: "Scan failed",
        description: "Could not read the checklist image. Try a clearer photo.",
        variant: "destructive",
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (updates: { taskId: string; status: string }[]) => {
      return syncRawTaskRequest("POST", "/api/checklist/apply", { updates }, queryClient);
    },
    onSuccess: (data) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({
          title: "Queued",
          description: "Checklist updates will apply when you're online.",
        });
        return;
      }
      const d = data as { updated: number };
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      setScanResult(null);
      setTaskUpdates({});
      toast({
        title: "Tasks updated!",
        description: `${d.updated} task(s) marked as completed.`,
      });
      playIfEligible(2);
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Could not apply the task updates.",
        variant: "destructive",
      });
    },
  });

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const result = await postPaidDownload(`/api/checklist/${selectedDate}/download`, {});
      if (!result.ok) {
        if (result.insufficientCoins) {
          toast({
            title: "Not enough AxCoins",
            description: result.insufficientCoins.message
              ?? `Need ${result.insufficientCoins.required} coins (balance ${result.insufficientCoins.balance}). Visit Rewards to earn more.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Download failed",
            description: result.message || "Could not generate the checklist PDF.",
            variant: "destructive",
          });
        }
        return;
      }
      triggerBlobDownload(result.blob, `AxTask-Checklist-${selectedDate}.pdf`, result.filename);
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      toast({
        title: "Checklist downloaded!",
        description: "Print it out and check off your tasks as you go.",
      });
    } catch {
      toast({
        title: "Download failed",
        description: "Could not generate the checklist PDF.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  }, [selectedDate, toast, queryClient]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      scanMutation.mutate(file);
      e.target.value = "";
    },
    [scanMutation]
  );

  const handleApply = useCallback(() => {
    const updates = Object.entries(taskUpdates)
      .filter(([, checked]) => checked)
      .map(([taskId]) => ({ taskId, status: "completed" }));

    if (updates.length === 0) {
      toast({ title: "Nothing to apply", description: "No tasks selected for completion." });
      return;
    }

    applyMutation.mutate(updates);
  }, [taskUpdates, applyMutation, toast]);

  const navigateDate = (direction: number) => {
    const current = new Date(selectedDate + "T00:00:00");
    const next = direction > 0 ? addDays(current, 1) : subDays(current, 1);
    setSelectedDate(format(next, "yyyy-MM-dd"));
    setScanResult(null);
    setTaskUpdates({});
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-4xl mx-auto">
      <PretextPageHeader
        eyebrow="Checklist"
        title="Print Checklist"
        subtitle={
          <>
            Download a printable daily checklist, then scan it back to update your tasks.{" "}
            {exportPrices?.freeInDev ? (
              <span className="text-emerald-400">PDF export is free in local dev.</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                PDF download costs {exportPrices?.checklistPdf ?? "…"} AxCoins
                {wallet != null ? ` · you have ${wallet.balance}` : ""}.
              </span>
            )}
          </>
        }
      />

      <Card className="glass-panel-glossy">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Daily Checklist
          </CardTitle>
          <CardDescription>
            Choose a date to generate your printable task list
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateDate(-1)}
              title="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setScanResult(null);
                setTaskUpdates({});
              }}
              className="w-48"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateDate(1)}
              title="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDate(new Date().toISOString().split("T")[0]);
                setScanResult(null);
              }}
            >
              Today
            </Button>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            {tasksLoading ? (
              <span>Loading tasks...</span>
            ) : (
              <>
                <span className="font-medium">{dayTasks.length} tasks</span>
                <span className="text-yellow-600">{pendingCount} pending</span>
                <span className="text-green-600">{completedCount} done</span>
              </>
            )}
          </div>

          {dayTasks.length > 0 && (
            <div className="border rounded-lg divide-y dark:divide-gray-700 max-h-64 overflow-y-auto">
              {dayTasks
                .sort((a, b) => {
                  const order: Record<string, number> = { pending: 0, "in-progress": 1, completed: 2 };
                  return (order[a.status] ?? 0) - (order[b.status] ?? 0) || (b.priorityScore || 0) - (a.priorityScore || 0);
                })
                .map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-4 py-2 text-sm"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        task.status === "completed"
                          ? "bg-green-500"
                          : task.status === "in-progress"
                          ? "bg-yellow-500"
                          : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    />
                    <span
                      className={`flex-1 ${
                        task.status === "completed"
                          ? "line-through text-gray-400"
                          : "text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {task.activity}
                    </span>
                    {task.time && (
                      <span className="text-xs text-gray-400">{task.time}</span>
                    )}
                    <Badge
                      variant="outline"
                      className="text-xs"
                    >
                      {task.priority}
                    </Badge>
                  </div>
                ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleDownload}
              disabled={isDownloading || dayTasks.length === 0}
              className="flex-1"
            >
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleDownload().then(() => {
                  setTimeout(() => window.print(), 500);
                });
              }}
              disabled={dayTasks.length === 0}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Scan Completed Checklist
          </CardTitle>
          <CardDescription>
            Take a photo of your completed checklist and upload it here. We'll
            read the checkmarks and update your tasks automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {scanMutation.isPending ? (
              <div className="space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Reading your checklist... This may take a moment.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-center gap-4">
                  <Camera className="h-10 w-10 text-gray-400" />
                  <Upload className="h-10 w-10 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Take a photo or upload an image of your completed checklist
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Supports JPG, PNG, HEIC up to 10 MB
                </p>
              </div>
            )}
          </div>

          {scanResult && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  Scan Results
                </h3>
                <div className="flex gap-2 text-sm">
                  <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30">
                    <CheckCircle className="mr-1 h-3 w-3 text-green-600" />
                    {scanResult.matchedTasks.filter((m) => m.wasChecked).length}{" "}
                    checked
                  </Badge>
                  <Badge variant="outline">
                    {scanResult.matchedTasks.length} matched
                  </Badge>
                </div>
              </div>

              {scanResult.matchedTasks.length > 0 && (
                <div className="border rounded-lg divide-y dark:divide-gray-700">
                  {scanResult.matchedTasks.map((match) => (
                    <div
                      key={match.taskId}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <Checkbox
                        checked={taskUpdates[match.taskId] || false}
                        onCheckedChange={(checked) =>
                          setTaskUpdates((prev) => ({
                            ...prev,
                            [match.taskId]: !!checked,
                          }))
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {match.activity}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">
                            {match.confidence}% match
                          </span>
                          {match.wasChecked && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            >
                              checked on paper
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {scanResult.unmatchedLines.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Unrecognized items
                      </p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 space-y-0.5">
                        {scanResult.unmatchedLines.slice(0, 5).map((line, i) => (
                          <li key={i}>• {line}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleApply}
                  disabled={
                    applyMutation.isPending ||
                    Object.values(taskUpdates).filter(Boolean).length === 0
                  }
                  className="flex-1"
                >
                  {applyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Mark {Object.values(taskUpdates).filter(Boolean).length} Task
                  {Object.values(taskUpdates).filter(Boolean).length !== 1
                    ? "s"
                    : ""}{" "}
                  as Complete
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setScanResult(null);
                    setTaskUpdates({});
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
