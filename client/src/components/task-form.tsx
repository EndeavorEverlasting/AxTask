import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertTaskSchema, type InsertTask, type Task } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { PriorityEngine } from "@/lib/priority-engine";
import { useToast } from "@/hooks/use-toast";
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

interface TaskFormProps {
  task?: Task;
  defaultDate?: string;
  onSuccess?: () => void;
}

export function TaskForm({ task, defaultDate, onSuccess }: TaskFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [previewPriority, setPreviewPriority] = useState({ score: 0, priority: "Low" });

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: task ? {
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
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: InsertTask) => {
      if (task) {
        // Update existing task
        const response = await apiRequest("PUT", `/api/tasks/${task.id}`, taskData);
        return response.json();
      } else {
        // Create new task
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
      if (!task) form.reset(); // Only reset for new tasks
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

  // Real-time priority calculation
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
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const onSubmit = (data: InsertTask) => {
    createTaskMutation.mutate(data);
  };

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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <FormLabel>Date</FormLabel>
                      <Popover modal={true}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
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
                              if (day) field.onChange(format(day, "yyyy-MM-dd"));
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
                    <FormLabel>Time <span className="text-xs text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl>
                      <ClockTimePicker
                        value={field.value || undefined}
                        onChange={(t) => field.onChange(t)}
                      />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
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
                      <FormLabel>Activity</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter task activity..." {...field} />
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
                    <Select onValueChange={(value) => field.onChange(value && value !== "auto" ? parseInt(value) : undefined)}>
                      <FormControl>
                        <SelectTrigger>
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
                    <Select onValueChange={(value) => field.onChange(value && value !== "auto" ? parseInt(value) : undefined)}>
                      <FormControl>
                        <SelectTrigger>
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
                    <Select onValueChange={(value) => field.onChange(value && value !== "auto" ? parseInt(value) : undefined)}>
                      <FormControl>
                        <SelectTrigger>
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
                      <Input placeholder="Dependencies or prerequisites..." {...field} />
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
                  onClick={() => form.reset()}
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
