import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { insertTaskSchema, type InsertTask, type Task } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { PriorityEngine } from "@/lib/priority-engine";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { parseVoiceCommands, stripCommandText } from "@/lib/voice-commands";
import { useVoice } from "@/hooks/use-voice";
import { useCollaboration } from "@/hooks/use-collaboration";
import { MicButton } from "@/components/mic-button";
import { ShareDialog } from "@/components/share-dialog";
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
import { Plus, CalendarIcon, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { useFieldFlow } from "@/hooks/use-field-flow";

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
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [previewPriority, setPreviewPriority] = useState({ score: 0, priority: "Low" });
  const { onFieldBlur, isHinted } = useFieldFlow();
  const [warningFields, setWarningFields] = useState<Set<string>>(new Set());
  const warningTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [voiceTarget, setVoiceTarget] = useState<"activity" | "notes">("activity");
  const [debouncedActivity, setDebouncedActivity] = useState("");
  const [deadlineSuggestion, setDeadlineSuggestion] = useState<{
    suggestedDate: string;
    reason: string;
    confidence: number;
  } | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

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
    return editing ? (editing.displayName || editing.email) : undefined;
  }, [collab.users, collab.connected, task, user?.id]);

  const draftContext = task ? `edit_${task.id}` : defaultDate ? `date_${defaultDate}` : "new";
  const draftKey = getDraftKey(user?.id, draftContext);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const freshDefaults: InsertTask = task ? {
    date: task.date,
    time: task.time || "",
    activity: task.activity,
    notes: task.notes || "",
    urgency: task.urgency || undefined,
    impact: task.impact || undefined,
    effort: task.effort || undefined,
    prerequisites: task.prerequisites || "",
    status: task.status,
  } : {
    date: defaultDate || new Date().toISOString().split('T')[0],
    time: "",
    activity: "",
    notes: "",
    urgency: undefined,
    impact: undefined,
    effort: undefined,
    prerequisites: "",
    status: "pending",
  };

  const draft = !task ? loadDraft(draftKey) : null;
  const mergedDefaults = draft ? { ...freshDefaults, ...draft } : freshDefaults;

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: mergedDefaults,
  });

  const addWarning = useCallback((fieldName: string) => {
    const existing = warningTimers.current.get(fieldName);
    if (existing) clearTimeout(existing);

    setWarningFields(prev => new Set(prev).add(fieldName));

    const timer = setTimeout(() => {
      setWarningFields(prev => {
        const next = new Set(prev);
        next.delete(fieldName);
        return next;
      });
      warningTimers.current.delete(fieldName);
    }, 5000);
    warningTimers.current.set(fieldName, timer);
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
        form.setValue("status", cmd.value);
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
  });

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
        const response = await apiRequest("PUT", `/api/tasks/${task.id}`, taskData);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/tasks", taskData);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      toast({
        title: task ? "Task updated" : "Task created",
        description: task ? "Your task has been updated successfully." : "Your task has been added successfully.",
      });
      if (!task) {
        form.reset();
        clearDraft(draftKey);
      }
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create task",
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

    apiRequest("POST", "/api/patterns/suggest-deadline", { activity: debouncedActivity })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.suggestion) {
          setDeadlineSuggestion(data.suggestion);
          setSuggestionDismissed(false);
        } else if (!cancelled) {
          setDeadlineSuggestion(null);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Quick Task Entry</CardTitle>
            <CardDescription>
              Add a new task with automatic priority calculation
            </CardDescription>
          </div>
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
              <ShareDialog taskId={task!.id} isOwner={isOwner} />
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
                          {(u.displayName || u.email).charAt(0).toUpperCase()}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{u.displayName || u.email}</p>
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
                    Use {new Date(deadlineSuggestion.suggestedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
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
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <div className="flex gap-2 items-start">
                          <div className="relative flex-1">
                            <Textarea
                              rows={3}
                              placeholder="Add detailed notes, tags (@urgent, #blocker), or dictate with mic..."
                              {...field}
                              className={cn(getFieldClass("notes"), getCollabFieldStyle("notes"), "w-full")}
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
                        </div>
                      </FormControl>
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
                name="prerequisites"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prerequisites</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Dependencies or prerequisites..."
                        {...field}
                        className={cn("min-h-[44px]", getFieldClass("prerequisites"))}
                        onBlur={(e) => { field.onBlur(); onFieldBlur("prerequisites", e.target.value); }}
                      />
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
                <Button type="submit" disabled={createTaskMutation.isPending} title="Submit (Ctrl+Enter)" className="min-h-[44px]">
                  <Plus className="mr-2 h-4 w-4" />
                  {createTaskMutation.isPending 
            ? (task ? "Updating..." : "Adding...") 
            : (task ? "Update Task" : "Add Task")
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
