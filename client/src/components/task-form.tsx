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
import { PriorityBadge } from "./priority-badge";
import { Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TaskFormProps {
  task?: Task;
  onSuccess?: () => void;
}

export function TaskForm({ task, onSuccess }: TaskFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [previewPriority, setPreviewPriority] = useState({ score: 0, priority: "Low" });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: task ? {
      date: task.date,
      time: task.time,
      activity: task.activity,
      notes: task.notes || "",
      urgency: task.urgency || undefined,
      impact: task.impact || undefined,
      effort: task.effort || undefined,
      prerequisites: task.prerequisites || "",
      status: task.status as "pending" | "in-progress" | "completed",
    } : {
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5), // HH:MM format from current time
      activity: "",
      notes: "",
      urgency: undefined,
      impact: undefined,
      effort: undefined,
      prerequisites: "",
      status: "pending" as const,
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

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest("DELETE", `/api/tasks/${taskId}`);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      toast({
        title: "Task deleted",
        description: "Your task has been permanently deleted.",
      });
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    if (task) {
      deleteTaskMutation.mutate(task.id);
      setShowDeleteDialog(false);
    }
  };

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
    <>
    <Card className="task-form-card transition-all duration-300">
      <CardHeader>
        <CardTitle>{task ? "Edit Task" : "Quick Task Entry"}</CardTitle>
        <CardDescription>
          {task ? "Update task details and priority" : "Add a new task with automatic priority calculation"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <style>{`
              .task-form-card:has(.btn-submit:focus) {
                outline: 2px solid rgb(34, 197, 94);
                box-shadow: 0 10px 15px -3px rgba(34, 197, 94, 0.3), 0 4px 6px -4px rgba(34, 197, 94, 0.3);
              }
              .task-form-card:has(.btn-delete:focus) {
                outline: 2px solid rgb(239, 68, 68);
                box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3), 0 4px 6px -4px rgba(239, 68, 68, 0.3);
              }
              .task-form-card:has(.btn-cancel:focus) {
                outline: 2px solid rgb(156, 163, 175);
                box-shadow: 0 10px 15px -3px rgba(156, 163, 175, 0.3), 0 4px 6px -4px rgba(156, 163, 175, 0.3);
              }
              .task-form-card:has(input:focus),
              .task-form-card:has(textarea:focus),
              .task-form-card:has(button[role="combobox"]:focus) {
                outline: 2px solid rgb(156, 163, 175);
                box-shadow: 0 10px 15px -3px rgba(156, 163, 175, 0.3), 0 4px 6px -4px rgba(156, 163, 175, 0.3);
              }
            `}</style>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        data-testid="input-task-date"
                        autoFocus={!task}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-task-time" />
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
                        <SelectTrigger data-testid="select-task-status">
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
                {task && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={deleteTaskMutation.isPending}
                    className="btn-delete"
                    data-testid="button-delete-task"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deleteTaskMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                )}
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    if (onSuccess) {
                      onSuccess();
                    } else {
                      form.reset();
                    }
                  }}
                  className="btn-cancel"
                  data-testid="button-cancel-form"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createTaskMutation.isPending}
                  className="btn-submit"
                  data-testid="button-submit-task"
                >
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

    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent className="delete-dialog-content">
        <style>{`
          .delete-dialog-content:has(.btn-confirm-delete:focus) {
            outline: 2px solid rgb(239, 68, 68);
            box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3), 0 4px 6px -4px rgba(239, 68, 68, 0.3);
          }
          .delete-dialog-content:has(.btn-cancel-delete:focus) {
            outline: 2px solid rgb(156, 163, 175);
            box-shadow: 0 10px 15px -3px rgba(156, 163, 175, 0.3), 0 4px 6px -4px rgba(156, 163, 175, 0.3);
          }
        `}</style>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Task</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this task? This action cannot be undone.
            {task && (
              <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                <p className="font-medium text-gray-900 dark:text-gray-100">{task.activity}</p>
                {task.notes && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{task.notes}</p>
                )}
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="btn-cancel-delete" data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 btn-confirm-delete"
            data-testid="button-confirm-delete"
          >
            Delete Task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
