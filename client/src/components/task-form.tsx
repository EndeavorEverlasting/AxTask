import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { insertTaskSchema, type InsertTask, type Task } from "@shared/schema";
import { apiFetch, apiRequest, getCsrfToken } from "@/lib/queryClient";
import { AXTASK_CSRF_HEADER } from "@shared/http-auth";
import {
  syncCreateTask,
  syncUpdateTask,
  TaskSyncAbortedError,
} from "@/lib/task-sync-api";
import { PriorityEngine } from "@/lib/priority-engine";
import { useToast } from "@/hooks/use-toast";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { useImmersiveSounds } from "@/hooks/use-immersive-sounds";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { parseVoiceCommands, stripCommandText } from "@/lib/voice-commands";
import { useVoice } from "@/hooks/use-voice";
import { useCollaboration } from "@/hooks/use-collaboration";
import { MicButton } from "@/components/mic-button";
import { ShareDialog } from "@/components/share-dialog";
import { TaskReportDownload } from "@/components/task-report-download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PriorityBadge } from "./priority-badge";
import { ClockTimePicker } from "@/components/ui/clock-time-picker";
import { Plus, CalendarIcon, Lightbulb, Save, Sparkles, ImagePlus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { useFieldFlow } from "@/hooks/use-field-flow";
import { useLiveClassificationStream } from "@/hooks/use-live-classification-stream";

interface TaskFormProps {
  task?: Task;
  defaultDate?: string;
  onSuccess?: () => void;
}

const DRAFT_KEY_PREFIX = "axtask_draft";

function getDraftKey(userId?: string, context?: string): string {
  return `${DRAFT_KEY_PREFIX}_${userId || "anon"}_${context || "new"}`;
}

function saveDraft(key: string, data: Partial<InsertTask>) {
  try {
    const hasContent = data.activity || data.notes || data.prerequisites || data.time ||
      data.urgency !== undefined || data.impact !== undefined || data.effort !== undefined ||
      (data.status && data.status !== "pending");
    if (!hasContent) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch { /* localStorage unavailable */ }
}

function loadDraft(key: string): Partial<InsertTask> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const oneDay = 24 * 60 * 60 * 1000;
    if (parsed.savedAt && Date.now() - parsed.savedAt > oneDay) {
      localStorage.removeItem(key);
      return null;
    }
    const { savedAt, ...draft } = parsed;
    return draft;
  } catch { return null; }
}

function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

export function TaskForm({ task, defaultDate, onSuccess }: TaskFormProps) {
  const { toast } = useToast();
  const { playIfEligible } = useImmersiveSounds();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [previewPriority, setPreviewPriority] = useState({ score: 0, priority: "Low" });
  const { onFieldBlur, isHinted } = useFieldFlow();
  const [warningFields, setWarningFields] = useState<Set<string>>(new Set());
  const warningTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [voiceTarget, setVoiceTarget] = useState<"activity" | "notes" | "prerequisites">("activity");
  const [debouncedActivity, setDebouncedActivity] = useState("");
  const [deadlineSuggestion, setDeadlineSuggestion] = useState<{
    suggestedDate: string;
    reason: string;
    confidence: number;
  } | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const liveClassificationPushRef = useRef<(activity: string, notes: string) => void>(() => {});

  // ── Image attachments ──────────────────────────────────────────────────────
  type TaskAttachment = { assetId: string; fileName: string; mimeType: string; uploading?: boolean };
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only images are supported", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image must be under 10 MB", variant: "destructive" });
      return;
    }
    const placeholder: TaskAttachment = { assetId: "uploading", fileName: file.name, mimeType: file.type, uploading: true };
    setTaskAttachments((prev) => [...prev, placeholder]);
    try {
      const uploadUrlRes = await apiRequest("POST", "/api/attachments/upload-url", {
        fileName: file.name,
        mimeType: file.type,
        byteSize: file.size,
        kind: "task",
        taskId: task?.id,
      });
      const { assetId, uploadUrl } = await uploadUrlRes.json() as { assetId: string; uploadUrl: string };
      const headers: Record<string, string> = { "Content-Type": file.type };
      const csrf = getCsrfToken();
      if (csrf) headers[AXTASK_CSRF_HEADER] = csrf;
      const putRes = await fetch(uploadUrl, { method: "PUT", headers, body: file, credentials: "include" });
      if (!putRes.ok) throw new Error("Upload failed");
      setTaskAttachments((prev) => prev.map((a) => a === placeholder ? { assetId, fileName: file.name, mimeType: file.type } : a));
    } catch {
      setTaskAttachments((prev) => prev.filter((a) => a !== placeholder));
      toast({ title: "Failed to upload image", variant: "destructive" });
    }
  }, [task?.id, toast]);

  const removeAttachment = useCallback(async (assetId: string) => {
    try {
      await apiRequest("DELETE", `/api/attachments/${assetId}`);
    } catch { /* ignore */ }
    setTaskAttachments((prev) => prev.filter((a) => a.assetId !== assetId));
  }, []);

  // Load existing attachments for edit mode
  useEffect(() => {
    if (!task?.id) return;
    fetch(`/api/tasks/${task.id}/attachments`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((assets: Array<{ id: string; fileName: string; mimeType: string }>) => {
        setTaskAttachments(assets.map((a) => ({ assetId: a.id, fileName: a.fileName || "image", mimeType: a.mimeType })));
      })
      .catch(() => {});
  }, [task?.id]);

  const collab = useCollaboration(task?.id ?? null);
  const isEditing = !!task;
  const isOwner = !task || task.userId === user?.id;

  const getCollabFieldStyle = useCallback((fieldName: string): string => {
    if (!collab.connected || !task) return "";
    const editing = collab.users.find(u => u.focusedField === fieldName && u.userId !== user?.id);
    if (editing) return `ring-2 ring-offset-1`;
    return "";
  }, [collab.users, collab.connected, task, user?.id]);

  const getCollabFieldColor = useCallback((fieldName: string): string | undefined => {
    if (!collab.connected || !task) return undefined;
    const editing = collab.users.find(u => u.focusedField === fieldName && u.userId !== user?.id);
    return editing?.color;
  }, [collab.users, collab.connected, task, user?.id]);

  const getCollabFieldUser = useCallback((fieldName: string): string | undefined => {
    if (!collab.connected || !task) return undefined;
    const editing = collab.users.find(u => u.focusedField === fieldName && u.userId !== user?.id);
    return editing ? (editing.displayName || editing.userId) : undefined;
  }, [collab.users, collab.connected, task, user?.id]);

  const draftContext = task ? `edit_${task.id}` : defaultDate ? `date_${defaultDate}` : "new";
  const draftKey = getDraftKey(user?.id, draftContext);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const freshDefaults: InsertTask = task
    ? {
        date: task.date,
        time: task.time || "",
        activity: task.activity,
        notes: task.notes || "",
        urgency: task.urgency || undefined,
        impact: task.impact || undefined,
        effort: task.effort || undefined,
        prerequisites: task.prerequisites || "",
        recurrence:
          (task.recurrence as
            | "none"
            | "daily"
            | "weekly"
            | "biweekly"
            | "monthly"
            | "quarterly"
            | "yearly") || "none",
        status: task.status as "pending" | "in-progress" | "completed",
        visibility: (task.visibility as "private" | "public") ?? "private",
        communityShowNotes: Boolean(task.communityShowNotes),
      }
    : {
        date: defaultDate || new Date().toISOString().split("T")[0],
        time: "",
        activity: "",
        notes: "",
        urgency: undefined,
        impact: undefined,
        effort: undefined,
        prerequisites: "",
        recurrence: "none" as const,
        status: "pending",
        visibility: "private",
        communityShowNotes: false,
      };

  const draft = !task ? loadDraft(draftKey) : null;
  const mergedDefaults = draft ? { ...freshDefaults, ...draft } : freshDefaults;

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: mergedDefaults,
  });

  const addWarning = useCallback((fieldName: string, autoExpire = false) => {
    const existing = warningTimers.current.get(fieldName);
    if (existing) clearTimeout(existing);

    setWarningFields(prev => new Set(prev).add(fieldName));

    if (autoExpire) {
      const timer = setTimeout(() => {
        setWarningFields(prev => {
          const next = new Set(prev);
          next.delete(fieldName);
          return next;
        });
        warningTimers.current.delete(fieldName);
      }, 5000);
      warningTimers.current.set(fieldName, timer);
    }
  }, []);

  const clearWarning = useCallback((fieldName: string) => {
    const existing = warningTimers.current.get(fieldName);
    if (existing) clearTimeout(existing);
    warningTimers.current.delete(fieldName);
    setWarningFields(prev => {
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
  }, []);

  const isWarned = useCallback((fieldName: string) => warningFields.has(fieldName), [warningFields]);

  const handleVoiceResult = useCallback((transcript: string) => {
    const commands = parseVoiceCommands(transcript);
    const cleanText = commands.length > 0 ? stripCommandText(transcript) : transcript;

    for (const cmd of commands) {
      if (cmd.type === "urgency" && typeof cmd.value === "number") {
        form.setValue("urgency", cmd.value);
      } else if (cmd.type === "status" && typeof cmd.value === "string") {
        if (cmd.value === "pending" || cmd.value === "in-progress" || cmd.value === "completed") {
          form.setValue("status", cmd.value);
        }
      } else if (cmd.type === "date" && typeof cmd.value === "string") {
        form.setValue("date", cmd.value);
      } else if (cmd.type === "tag" && typeof cmd.value === "string") {
        const notes = form.getValues("notes") || "";
        form.setValue("notes", notes ? `${notes} ${cmd.value}` : cmd.value);
      }
    }

    if (cleanText) {
      const currentVal = form.getValues(voiceTarget) || "";
      const newVal = currentVal ? `${currentVal} ${cleanText}` : cleanText;
      form.setValue(voiceTarget, newVal);
      clearWarning(voiceTarget);
    }
  }, [voiceTarget, form, clearWarning]);

  const speech = useSpeechRecognition({
    continuous: true,
    onResult: handleVoiceResult,
    onLiveText: (combined) => {
      const target = voiceTarget;
      const activityVal = form.getValues("activity") || "";
      const notesVal = form.getValues("notes") || "";
      const prereqVal = form.getValues("prerequisites") || "";
      if (target === "activity") {
        liveClassificationPushRef.current(combined, notesVal);
      } else if (target === "notes") {
        liveClassificationPushRef.current(activityVal, combined);
      } else {
        const notesSide = [notesVal, prereqVal, combined].filter(Boolean).join("\n");
        liveClassificationPushRef.current(activityVal, notesSide);
      }
    },
  });

  const {
    suggestions: liveTopicSuggestions,
    loading: liveTopicLoading,
    pushLiveText,
  } = useLiveClassificationStream({
    enabled: speech.status === "listening",
  });

  useEffect(() => {
    liveClassificationPushRef.current = (activity, notes) => pushLiveText(activity, notes);
  }, [pushLiveText]);

  useEffect(() => {
    if (speech.error) {
      toast({
        title: "Microphone issue",
        description: speech.error,
        variant: "destructive",
      });
    }
  }, [speech.error, toast]);

  const getFieldClass = useCallback((fieldName: string, extraClass?: string) => {
    return cn(
      isHinted(fieldName) && "field-glow-hint",
      isWarned(fieldName) && "field-glow-warning",
      extraClass
    );
  }, [isHinted, isWarned]);

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: InsertTask) => {
      if (task) {
        return syncUpdateTask(task.id, taskData as Record<string, unknown>, task, queryClient);
      }
      return syncCreateTask(taskData, queryClient, user?.id ?? "");
    },
    onSuccess: async (data: unknown) => {
      const d = data as {
        id?: string;
        offlineQueued?: boolean;
        classificationReward?: unknown;
        coinReward?: unknown;
        uniqueTaskReward?: { coins: number; newBalance: number } | null;
      };
      if (d?.offlineQueued) {
        toast({
          title: "Saved offline",
          description: "Will sync when you're back online.",
        });
        if (!task) {
          form.reset({
            date: defaultDate || new Date().toISOString().split("T")[0],
            time: "",
            activity: "",
            notes: "",
            urgency: undefined,
            impact: undefined,
            effort: undefined,
            prerequisites: "",
            recurrence: "none",
            status: "pending",
          });
          clearDraft(draftKey);
          setTaskAttachments([]);
        }
        onSuccess?.();
        return;
      }

      // Link any unlinked attachments to the newly created task
      const createdTaskId = d?.id || task?.id;
      if (createdTaskId && taskAttachments.length > 0) {
        for (const att of taskAttachments) {
          if (att.assetId && att.assetId !== "uploading") {
            try {
              await apiRequest("POST", `/api/tasks/${createdTaskId}/attachments/link`, { assetId: att.assetId });
            } catch { /* best-effort */ }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });

      if (d?.coinReward || d?.classificationReward || d?.uniqueTaskReward) {
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/badges"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/classification-stats"] });
      }

      if (d?.classificationReward) {
        const cr = d.classificationReward as { coinsEarned: number; classification: string; newBalance: number };
        toast({
          title: `${task ? "Task updated" : "Task created"} — +${cr.coinsEarned} AxCoins!`,
          description: `Classified as ${cr.classification}. New balance: ${cr.newBalance}`,
        });
        playIfEligible(1);
      } else {
        let desc = task ? "Your task has been updated successfully." : "Your task has been added successfully.";
        if (!task && d?.uniqueTaskReward && d.uniqueTaskReward.coins > 0) {
          desc = `${desc} +${d.uniqueTaskReward.coins} AxCoins new-task bonus (balance ${d.uniqueTaskReward.newBalance}).`;
        }
        toast({
          title: task ? "Task updated" : "Task created",
          description: desc,
        });
        if (d?.coinReward || (!task && d?.uniqueTaskReward && d.uniqueTaskReward.coins > 0)) playIfEligible(1);
        else playIfEligible(3);
      }

      if (!task && !d?.offlineQueued) {
        requestFeedbackNudge("task_create");
      }

      if (!task) {
        form.reset({
          date: defaultDate || new Date().toISOString().split("T")[0],
          time: "",
          activity: "",
          notes: "",
          urgency: undefined,
          impact: undefined,
          effort: undefined,
          prerequisites: "",
          recurrence: "none",
          status: "pending",
        });
        clearDraft(draftKey);
        setTaskAttachments([]);
      }
      onSuccess?.();
    },
    onError: (error: unknown) => {
      if (error instanceof TaskSyncAbortedError) return;
      const message = error instanceof Error ? error.message : "Failed to save task";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const subscription = form.watch((values) => {
      if (values.activity || values.notes) {
        const result = PriorityEngine.calculatePreviewPriority(
          values.activity || "",
          values.notes || "",
          values.urgency,
          values.impact,
          values.effort
        );
        setPreviewPriority(result);
      }
      if (!task) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveDraft(draftKey, values as Partial<InsertTask>);
        }, 500);
      }
    });
    return () => {
      subscription.unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, draftKey, task]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (task) return;
    const sub = form.watch((values) => {
      const activity = values.activity || "";
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (activity.length >= 3) {
        debounceTimerRef.current = setTimeout(() => setDebouncedActivity(activity), 600);
      } else {
        setDebouncedActivity("");
        setDeadlineSuggestion(null);
      }
    });
    return () => {
      sub.unsubscribe();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [form, task]);

  useEffect(() => {
    if (!debouncedActivity || debouncedActivity.length < 3 || task) return;
    let cancelled = false;
    const ac = new AbortController();

    apiFetch("POST", "/api/patterns/suggest-deadline", { activity: debouncedActivity }, undefined, ac.signal)
      .then(async (res) => {
        if (ac.signal.aborted) return;
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.warn("[task-form] suggest-deadline failed:", res.status, t || res.statusText);
          if (!cancelled && !ac.signal.aborted) setDeadlineSuggestion(null);
          return;
        }
        return res.json() as Promise<{ suggestion?: unknown }>;
      })
      .then((data) => {
        if (!data || cancelled || ac.signal.aborted) return;
        const s = data.suggestion;
        if (
          s &&
          typeof s === "object" &&
          typeof (s as { suggestedDate?: unknown }).suggestedDate === "string" &&
          typeof (s as { reason?: unknown }).reason === "string" &&
          typeof (s as { confidence?: unknown }).confidence === "number"
        ) {
          const suggestedDate = (s as { suggestedDate: string }).suggestedDate.trim();
          const ymd = /^\d{4}-\d{2}-\d{2}$/;
          const parsed = ymd.test(suggestedDate) ? Date.parse(`${suggestedDate}T12:00:00.000Z`) : Date.parse(suggestedDate);
          if (!Number.isFinite(parsed)) {
            setDeadlineSuggestion(null);
            return;
          }
          setDeadlineSuggestion(s as { suggestedDate: string; reason: string; confidence: number });
          setSuggestionDismissed(false);
        } else {
          setDeadlineSuggestion(null);
        }
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.warn("[task-form] suggest-deadline error:", e);
        if (!cancelled && !ac.signal.aborted) setDeadlineSuggestion(null);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [debouncedActivity, task]);

  useEffect(() => {
    return () => {
      warningTimers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const onSubmit = (data: InsertTask) => {
    createTaskMutation.mutate(data);
  };

  const handleSubmitWithWarnings = useCallback(() => {
    const values = form.getValues();
    let hasWarnings = false;

    if (!values.activity || values.activity.trim() === "") {
      addWarning("activity");
      hasWarnings = true;
    } else {
      clearWarning("activity");
    }

    if (!values.date || values.date.trim() === "") {
      addWarning("date");
      hasWarnings = true;
    } else {
      clearWarning("date");
    }

    if (!values.time || values.time.trim() === "") {
      addWarning("time");
      hasWarnings = true;
    } else {
      clearWarning("time");
    }

    if (!values.notes || values.notes.trim() === "") {
      addWarning("notes");
      hasWarnings = true;
    } else {
      clearWarning("notes");
    }

    if (hasWarnings) {
      toast({
        title: "Missing fields",
        description: "Some fields are empty — highlighted in yellow. You can still submit.",
        variant: "destructive",
      });
    }

    if (!values.prerequisites || values.prerequisites.trim() === "") {
      addWarning("prerequisites", true);
    } else {
      clearWarning("prerequisites");
    }

    form.handleSubmit(onSubmit)();
  }, [form, addWarning, clearWarning, toast, onSubmit]);

  const { consumeTaskPrefill } = useVoice();

  useEffect(() => {
    const prefill = consumeTaskPrefill();
    if (prefill && !task) {
      if (prefill.activity) form.setValue("activity", prefill.activity);
      if (prefill.date) form.setValue("date", prefill.date);
      if (prefill.time) form.setValue("time", prefill.time);
    }
  }, [consumeTaskPrefill, form, task]);

  // Intentionally mount-only: one-time yellow hints for a fresh composer, not re-run when task/form changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  useEffect(() => {
    if (task) return;
    const values = form.getValues();
    const emptyRequired: string[] = [];
    if (!values.activity || values.activity.trim() === "") emptyRequired.push("activity");
    if (!values.time || values.time.trim() === "") emptyRequired.push("time");
    if (!values.notes || values.notes.trim() === "") emptyRequired.push("notes");
    emptyRequired.forEach(f => addWarning(f));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmitWithWarnings();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmitWithWarnings]);

  return (
    <Card id="tutorial-task-form">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{task ? "Edit Task" : "Quick Task Entry"}</CardTitle>
            <CardDescription>
              {task ? "Update this task's details" : "Add a new task with automatic priority calculation"}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
            {speech.status === "listening" && (
              <div className="flex items-center gap-2 text-sm text-red-500 font-medium animate-pulse">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                Listening ({voiceTarget})
              </div>
            )}
            {isEditing && (
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <TaskReportDownload taskId={task!.id} activityPreview={task!.activity || "task"} />
                <ShareDialog
                  taskId={task!.id}
                  isOwner={isOwner}
                  visibility={task!.visibility}
                  communityShowNotes={task!.communityShowNotes}
                />
              </div>
            )}
            </div>
            {speech.status === "listening" && (liveTopicLoading || liveTopicSuggestions.length > 0) && (
              <div className="flex flex-wrap items-end justify-end gap-1.5 max-w-[min(100%,20rem)]">
                <span className="text-[11px] font-medium text-amber-700/90 dark:text-amber-400/90 flex items-center gap-1 shrink-0">
                  <Sparkles className="h-3 w-3" />
                  Topic
                </span>
                {liveTopicLoading && (
                  <span className="text-[11px] text-muted-foreground">Analyzing…</span>
                )}
                {liveTopicSuggestions.map((s) => (
                  <span
                    key={`${s.label}-${s.source}`}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200 tabular-nums"
                    title={
                      s.source === "nodeweaver"
                        ? "NodeWeaver"
                        : s.source === "catalog"
                          ? "Your categories"
                          : "AxTask classifier"
                    }
                  >
                    {s.label}
                    <span className="opacity-70 ml-1">{Math.round(s.confidence * 100)}%</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {collab.connected && collab.users.length > 1 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">Editing with:</span>
            <TooltipProvider>
              <div className="flex -space-x-2">
                {collab.users
                  .filter(u => u.userId !== user?.id)
                  .map(u => (
                    <Tooltip key={u.userId}>
                      <TooltipTrigger asChild>
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white dark:border-gray-900 cursor-default"
                          style={{ backgroundColor: u.color }}
                        >
                          {(u.displayName || u.userId).charAt(0).toUpperCase()}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{u.displayName || u.userId}</p>
                        {u.focusedField && <p className="text-xs opacity-70">Editing: {u.focusedField}</p>}
                      </TooltipContent>
                    </Tooltip>
                  ))}
              </div>
            </TooltipProvider>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={(e) => { e.preventDefault(); handleSubmitWithWarnings(); }} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => {
                  const dateValue = field.value
                    ? parse(field.value, "yyyy-MM-dd", new Date())
                    : undefined;
                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date <span className="text-red-400">*</span></FormLabel>
                      {isMobile ? (
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value || ""}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              if (e.target.value) {
                                clearWarning("date");
                                onFieldBlur("date", e.target.value);
                              }
                            }}
                            className={cn("min-h-[44px]", getFieldClass("date"))}
                          />
                        </FormControl>
                      ) : (
                        <Popover modal={true}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal min-h-[44px]",
                                  !field.value && "text-muted-foreground",
                                  getFieldClass("date")
                                )}
                                onBlur={() => onFieldBlur("date", field.value)}
                              >
                                {field.value
                                  ? format(dateValue!, "PPP")
                                  : "Pick a date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dateValue}
                              onSelect={(day) => {
                                if (day) {
                                  field.onChange(format(day, "yyyy-MM-dd"));
                                  clearWarning("date");
                                  onFieldBlur("date", format(day, "yyyy-MM-dd"));
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {deadlineSuggestion && !suggestionDismissed && !task && (
                <div className="col-span-1 lg:col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm">
                  <Lightbulb className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-emerald-700 dark:text-emerald-300 flex-1">
                    {deadlineSuggestion.reason}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                    onClick={() => {
                      form.setValue("date", deadlineSuggestion.suggestedDate);
                      clearWarning("date");
                      setDeadlineSuggestion(null);
                    }}
                  >
                    Use {(() => { const d = new Date(deadlineSuggestion.suggestedDate + "T12:00:00"); return isNaN(d.getTime()) ? (deadlineSuggestion.suggestedDate || "No date") : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); })()}
                  </Button>
                  <button
                    type="button"
                    className="text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-200 text-xs"
                    onClick={() => setSuggestionDismissed(true)}
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      {isMobile ? (
                        <Input
                          type="time"
                          value={field.value || ""}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            if (e.target.value) {
                              onFieldBlur("time", e.target.value);
                              clearWarning("time");
                            }
                          }}
                          className={cn("min-h-[44px]", getFieldClass("time"))}
                        />
                      ) : (
                        <div
                          className={cn(
                            "rounded-md",
                            isHinted("time") && "field-glow-hint",
                            isWarned("time") && "field-glow-warning"
                          )}
                          onBlur={() => onFieldBlur("time", field.value)}
                        >
                          <ClockTimePicker
                            value={field.value || undefined}
                            onChange={(t) => {
                              field.onChange(t);
                              if (t) {
                                onFieldBlur("time", t);
                                clearWarning("time");
                              }
                            }}
                          />
                        </div>
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={(v) => { field.onChange(v); onFieldBlur("status", v); }}
                      value={field.value || "pending"}
                    >
                      <FormControl>
                        <SelectTrigger
                          className={cn("min-h-[44px]", getFieldClass("status"))}
                        >
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="lg:col-span-2">
                <FormField
                  control={form.control}
                  name="activity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Activity <span className="text-red-400">*</span></FormLabel>
                      <FormControl>
                        <div className="flex gap-2 items-center">
                          <div className="relative flex-1">
                            <Input
                              placeholder="Enter task activity or use the mic..."
                              {...field}
                              className={cn("min-h-[44px]", getFieldClass("activity"), getCollabFieldStyle("activity"), "w-full")}
                              style={getCollabFieldColor("activity") ? { "--tw-ring-color": getCollabFieldColor("activity") } as React.CSSProperties : undefined}
                              onFocus={() => { setVoiceTarget("activity"); collab.focusField("activity"); }}
                              onBlur={(e) => {
                                field.onBlur();
                                onFieldBlur("activity", e.target.value);
                                if (e.target.value.trim()) clearWarning("activity");
                                collab.blurField();
                              }}
                              onChange={(e) => {
                                field.onChange(e);
                                if (e.target.value.trim()) clearWarning("activity");
                                collab.sendFieldEdit("activity", e.target.value);
                              }}
                            />
                            {getCollabFieldUser("activity") && (
                              <span className="absolute -top-5 right-0 text-xs px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: getCollabFieldColor("activity") }}>
                                {getCollabFieldUser("activity")}
                              </span>
                            )}
                          </div>
                          <MicButton
                            status={voiceTarget === "activity" ? speech.status : "idle"}
                            isSupported={speech.isSupported}
                            onClick={() => {
                              setVoiceTarget("activity");
                              speech.toggle();
                            }}
                            error={speech.error}
                          />
                        </div>
                      </FormControl>
                      {voiceTarget === "activity" && speech.interimTranscript && (
                        <p className="text-xs text-muted-foreground italic mt-1 animate-pulse">
                          {speech.interimTranscript}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="lg:col-span-2">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes <span className="text-xs text-muted-foreground font-normal ml-1">Supports **bold**, *italic*, `code`, and - lists</span></FormLabel>
                      <FormControl>
                        <div className="flex gap-2 items-start">
                          <div className="relative flex-1">
                            <Textarea
                              rows={3}
                              placeholder="Add detailed notes with **markdown**, tags (@urgent, #blocker), or dictate with mic..."
                              {...field}
                              className={cn(getFieldClass("notes"), getCollabFieldStyle("notes"), "w-full font-mono text-sm")}
                              style={getCollabFieldColor("notes") ? { "--tw-ring-color": getCollabFieldColor("notes") } as React.CSSProperties : undefined}
                              onFocus={() => { setVoiceTarget("notes"); collab.focusField("notes"); }}
                              onBlur={(e) => { field.onBlur(); onFieldBlur("notes", e.target.value); collab.blurField(); }}
                              onChange={(e) => {
                                field.onChange(e);
                                if (e.target.value.trim()) clearWarning("notes");
                                collab.sendFieldEdit("notes", e.target.value);
                              }}
                            />
                            {getCollabFieldUser("notes") && (
                              <span className="absolute -top-5 right-0 text-xs px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: getCollabFieldColor("notes") }}>
                                {getCollabFieldUser("notes")}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <MicButton
                              status={voiceTarget === "notes" ? speech.status : "idle"}
                              isSupported={speech.isSupported}
                              onClick={() => {
                                setVoiceTarget("notes");
                                speech.toggle();
                              }}
                              error={speech.error}
                              className="mt-1"
                            />
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9"
                                    onClick={() => imageInputRef.current?.click()}
                                  >
                                    <ImagePlus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Attach image</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <input
                              ref={imageInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImageUpload(file);
                                e.target.value = "";
                              }}
                            />
                          </div>
                        </div>
                      </FormControl>
                      {/* Attachment thumbnails */}
                      {taskAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {taskAttachments.map((att, idx) => (
                            <div key={att.assetId + idx} className="relative group w-16 h-16 rounded-md overflow-hidden border bg-muted">
                              {att.uploading ? (
                                <div className="flex items-center justify-center w-full h-full">
                                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                              ) : (
                                <img
                                  src={`/api/attachments/${att.assetId}/download`}
                                  alt={att.fileName}
                                  className="w-full h-full object-cover"
                                />
                              )}
                              {!att.uploading && (
                                <button
                                  type="button"
                                  onClick={() => removeAttachment(att.assetId)}
                                  className="absolute top-0 right-0 bg-black/60 text-white rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {voiceTarget === "notes" && speech.interimTranscript && (
                        <p className="text-xs text-muted-foreground italic mt-1 animate-pulse">
                          {speech.interimTranscript}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="urgency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Urgency (1-5)</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        const v = value && value !== "auto" ? parseInt(value) : undefined;
                        field.onChange(v);
                        onFieldBlur("urgency", v);
                      }}
                      value={field.value !== undefined && field.value !== null ? String(field.value) : "auto"}
                    >
                      <FormControl>
                        <SelectTrigger
                          className={cn("min-h-[44px]", getFieldClass("urgency"))}
                        >
                          <SelectValue placeholder="Auto-calculate" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="auto">Auto-calculate</SelectItem>
                        <SelectItem value="1">1 - Very Low</SelectItem>
                        <SelectItem value="2">2 - Low</SelectItem>
                        <SelectItem value="3">3 - Medium</SelectItem>
                        <SelectItem value="4">4 - High</SelectItem>
                        <SelectItem value="5">5 - Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="impact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Impact (1-5)</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        const v = value && value !== "auto" ? parseInt(value) : undefined;
                        field.onChange(v);
                        onFieldBlur("impact", v);
                      }}
                      value={field.value !== undefined && field.value !== null ? String(field.value) : "auto"}
                    >
                      <FormControl>
                        <SelectTrigger
                          className={cn("min-h-[44px]", getFieldClass("impact"))}
                        >
                          <SelectValue placeholder="Auto-calculate" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="auto">Auto-calculate</SelectItem>
                        <SelectItem value="1">1 - Minimal</SelectItem>
                        <SelectItem value="2">2 - Minor</SelectItem>
                        <SelectItem value="3">3 - Moderate</SelectItem>
                        <SelectItem value="4">4 - Major</SelectItem>
                        <SelectItem value="5">5 - Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="effort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effort (1-5)</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        const v = value && value !== "auto" ? parseInt(value) : undefined;
                        field.onChange(v);
                        onFieldBlur("effort", v);
                      }}
                      value={field.value !== undefined && field.value !== null ? String(field.value) : "auto"}
                    >
                      <FormControl>
                        <SelectTrigger
                          className={cn("min-h-[44px]", getFieldClass("effort"))}
                        >
                          <SelectValue placeholder="Auto-calculate" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="auto">Auto-calculate</SelectItem>
                        <SelectItem value="1">1 - Quick (&lt; 15 min)</SelectItem>
                        <SelectItem value="2">2 - Short (&lt; 1 hour)</SelectItem>
                        <SelectItem value="3">3 - Medium (&lt; 4 hours)</SelectItem>
                        <SelectItem value="4">4 - Long (&lt; 1 day)</SelectItem>
                        <SelectItem value="5">5 - Extended (&gt; 1 day)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recurrence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrence</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v)}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger className={cn("min-h-[44px]", getFieldClass("recurrence"))}>
                          <SelectValue placeholder="No recurrence" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No recurrence</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Biweekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="prerequisites"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prerequisites</FormLabel>
                    <FormControl>
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <Input
                            placeholder="Dependencies or prerequisites..."
                            {...field}
                            className={cn("min-h-[44px]", getFieldClass("prerequisites"), getCollabFieldStyle("prerequisites"), "w-full")}
                            style={getCollabFieldColor("prerequisites") ? { "--tw-ring-color": getCollabFieldColor("prerequisites") } as React.CSSProperties : undefined}
                            onFocus={() => { setVoiceTarget("prerequisites"); collab.focusField("prerequisites"); }}
                            onBlur={(e) => {
                              field.onBlur();
                              onFieldBlur("prerequisites", e.target.value);
                              if (e.target.value.trim()) clearWarning("prerequisites");
                              collab.blurField();
                            }}
                            onChange={(e) => {
                              field.onChange(e);
                              if (e.target.value.trim()) clearWarning("prerequisites");
                              collab.sendFieldEdit("prerequisites", e.target.value);
                            }}
                          />
                          {getCollabFieldUser("prerequisites") && (
                            <span className="absolute -top-5 right-0 text-xs px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: getCollabFieldColor("prerequisites") }}>
                              {getCollabFieldUser("prerequisites")}
                            </span>
                          )}
                        </div>
                        <MicButton
                          status={voiceTarget === "prerequisites" ? speech.status : "idle"}
                          isSupported={speech.isSupported}
                          onClick={() => {
                            setVoiceTarget("prerequisites");
                            speech.toggle();
                          }}
                          error={speech.error}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Calculated Priority: <PriorityBadge priority={previewPriority.priority} score={previewPriority.score} />
                </div>
              </div>
              <div className="flex space-x-3">
                <Button 
                  type="button" 
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => { form.reset(freshDefaults); clearDraft(draftKey); }}
                >
                  Clear
                </Button>
                <Button 
                  type="submit" 
                  disabled={createTaskMutation.isPending} 
                  title="Submit (Ctrl+Enter / Cmd+Enter — focus in the page)" 
                  className={cn(
                    "min-h-[44px]",
                    task 
                      ? "bg-blue-600 hover:bg-blue-700 text-white" 
                      : "bg-green-600 hover:bg-green-700 text-white field-glow-success"
                  )}
                >
                  {task ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {createTaskMutation.isPending 
                    ? (task ? "Updating..." : "Adding...") 
                    : (task ? "Update Task" : "+ Add Task")
                  }
                  <kbd className="ml-2 hidden sm:inline-flex items-center gap-0.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-mono opacity-70">⌃↵</kbd>
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
