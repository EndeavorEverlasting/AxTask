import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertTaskSchema, type InsertTask, type Task } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { PriorityEngine } from "@/lib/priority-engine";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PriorityBadge } from "./priority-badge";
import { ClockTimePicker } from "@/components/ui/clock-time-picker";
import { Plus, CalendarIcon } from "lucide-react";
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
  const queryClient = useQueryClient();
  const [previewPriority, setPreviewPriority] = useState({ score: 0, priority: "Low" });
  const { onFieldBlur, isHinted } = useFieldFlow();
  const [warningFields, setWarningFields] = useState<Set<string>>(new Set());
  const warningTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Task Entry</CardTitle>
        <CardDescription>
          Add a new task with automatic priority calculation
        </CardDescription>
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
                      <Popover modal={true}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
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
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Time</FormLabel>
                    <FormControl>
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
                          className={getFieldClass("status")}
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
                        <Input
                          placeholder="Enter task activity..."
                          {...field}
                          className={getFieldClass("activity")}
                          onBlur={(e) => {
                            field.onBlur();
                            onFieldBlur("activity", e.target.value);
                            if (e.target.value.trim()) clearWarning("activity");
                          }}
                          onChange={(e) => {
                            field.onChange(e);
                            if (e.target.value.trim()) clearWarning("activity");
                          }}
                        />
                      </FormControl>
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
                        <Textarea
                          rows={3}
                          placeholder="Add detailed notes, tags (@urgent, #blocker), or additional context..."
                          {...field}
                          className={getFieldClass("notes")}
                          onBlur={(e) => { field.onBlur(); onFieldBlur("notes", e.target.value); }}
                          onChange={(e) => {
                            field.onChange(e);
                            if (e.target.value.trim()) clearWarning("notes");
                          }}
                        />
                      </FormControl>
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
                          className={getFieldClass("urgency")}
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
                          className={getFieldClass("impact")}
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
                          className={getFieldClass("effort")}
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
                        className={getFieldClass("prerequisites")}
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
                  onClick={() => { form.reset(freshDefaults); clearDraft(draftKey); }}
                >
                  Clear
                </Button>
                <Button type="submit" disabled={createTaskMutation.isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  {createTaskMutation.isPending 
            ? (task ? "Updating..." : "Adding...") 
            : (task ? "Update Task" : "Add Task")
          }
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
