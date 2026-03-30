import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PriorityBadge } from "./priority-badge";
import { ClassificationBadge } from "./classification-badge";
import { TaskForm } from "./task-form";
import { Search, Edit, Check, Trash2, RotateCcw, ChevronUp, ChevronDown, GripVertical, Sparkles } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskAIEngine } from "@/lib/ai-modules";

type SortField = 'date' | 'priority' | 'activity' | 'classification' | 'priorityScore' | 'status' | 'manual';
type SortDirection = 'asc' | 'desc';

// Sortable row component for drag-and-drop
function SortableTaskRow({
  task,
  isDragMode,
  onEdit,
  onToggleStatus,
  onDelete,
  getStatusBadgeColor,
  formatStatus,
  isUpdating,
  isDeleting,
}: {
  task: Task;
  isDragMode: boolean;
  onEdit: (task: Task) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  getStatusBadgeColor: (status: string) => string;
  formatStatus: (status: string) => string;
  isUpdating: boolean;
  isDeleting: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !isDragMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${isDragging ? "bg-blue-50 dark:bg-blue-900/20 shadow-lg" : ""}`}
      onClick={() => !isDragMode && onEdit(task)}
    >
      {isDragMode && (
        <TableCell className="w-8">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            <GripVertical className="h-4 w-4 text-gray-400" />
          </button>
        </TableCell>
      )}
      <TableCell className="font-mono text-sm">{task.date}</TableCell>
      <TableCell>
        <PriorityBadge priority={task.priority} />
      </TableCell>
      <TableCell className="max-w-md">
        <div className="truncate">{task.activity}</div>
        {task.notes && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
            {task.notes}
          </div>
        )}
      </TableCell>
      <TableCell>
        <ClassificationBadge classification={task.classification} />
      </TableCell>
      <TableCell className="font-mono text-sm">
        {(task.priorityScore / 10).toFixed(1)}
      </TableCell>
      <TableCell>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(task.status)}`}>
          {formatStatus(task.status)}
        </span>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStatus(task.id, task.status === "completed" ? "pending" : "completed");
            }}
            disabled={isUpdating}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function TaskList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>('manual');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDragMode, setIsDragMode] = useState(false);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      toast({
        title: "Task deleted",
        description: "The task has been removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/tasks/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      toast({
        title: "Task updated",
        description: "Task status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
    },
  });

  const recalculatePrioritiesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tasks/recalculate");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Priorities recalculated",
        description: "All task priorities have been recalculated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to recalculate priorities",
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      await apiRequest("PATCH", "/api/tasks/reorder", { taskIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save task order",
        variant: "destructive",
      });
    },
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (field === 'manual') {
      setSortField('manual');
      setIsDragMode(true);
      return;
    }
    setIsDragMode(false);
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // AI smart sort
  const handleAISort = () => {
    const sorted = TaskAIEngine.suggestOptimalOrder(tasks);
    const taskIds = sorted.map(t => t.id);
    reorderMutation.mutate(taskIds);
    setSortField('manual');
    setIsDragMode(true);
    toast({
      title: "AI Reorder Applied",
      description: "Tasks reordered by AI based on priority, urgency, and deadlines.",
    });
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredAndSortedTasks.findIndex(t => t.id === active.id);
    const newIndex = filteredAndSortedTasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(filteredAndSortedTasks, oldIndex, newIndex);
    // Optimistically update the cache
    queryClient.setQueryData(["/api/tasks"], reordered);
    // Persist the new order
    reorderMutation.mutate(reordered.map(t => t.id));
  };

  // Sort and filter tasks
  const filteredAndSortedTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      const matchesSearch = !searchQuery ||
        task.activity.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.classification.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;

      return matchesSearch && matchesPriority && matchesStatus;
    });

    if (sortField === 'manual') {
      return filtered; // Use server sort order (sortOrder column)
    }

    return [...filtered].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'date') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else if (sortField === 'priority') {
        const priorityOrder = { 'Highest': 5, 'High': 4, 'Medium-High': 3, 'Medium': 2, 'Low': 1 };
        aValue = priorityOrder[aValue as keyof typeof priorityOrder] || 0;
        bValue = priorityOrder[bValue as keyof typeof priorityOrder] || 0;
      } else if (sortField === 'priorityScore') {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tasks, searchQuery, priorityFilter, statusFilter, sortField, sortDirection]);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "in-progress":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "pending":
        return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300";
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 animate-pulse rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Task List</CardTitle>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="Highest">Highest</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium-High">Medium-High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={isDragMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIsDragMode(!isDragMode);
                if (!isDragMode) setSortField('manual');
              }}
            >
              <GripVertical className="h-4 w-4 mr-2" />
              {isDragMode ? "Drag Mode" : "Drag"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAISort}
              disabled={reorderMutation.isPending}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              AI Sort
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalculatePrioritiesMutation.mutate()}
              disabled={recalculatePrioritiesMutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {recalculatePrioritiesMutation.isPending ? "Recalculating..." : "Recalculate"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredAndSortedTasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {tasks.length === 0 ? "No tasks found. Create your first task!" : "No tasks match your filters."}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isDragMode && <TableHead className="w-8"></TableHead>}
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center">
                        Date
                        {sortField === 'date' && (
                          sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('priority')}
                    >
                      <div className="flex items-center">
                        Priority
                        {sortField === 'priority' && (
                          sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('activity')}
                    >
                      <div className="flex items-center">
                        Activity
                        {sortField === 'activity' && (
                          sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('classification')}
                    >
                      <div className="flex items-center">
                        Classification
                        {sortField === 'classification' && (
                          sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('priorityScore')}
                    >
                      <div className="flex items-center">
                        Score
                        {sortField === 'priorityScore' && (
                          sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center">
                        Status
                        {sortField === 'status' && (
                          sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <SortableContext items={filteredAndSortedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {filteredAndSortedTasks.map((task: Task) => (
                      <SortableTaskRow
                        key={task.id}
                        task={task}
                        isDragMode={isDragMode}
                        onEdit={setEditingTask}
                        onToggleStatus={(id, status) => updateTaskStatusMutation.mutate({ id, status })}
                        onDelete={(id) => deleteTaskMutation.mutate(id)}
                        getStatusBadgeColor={getStatusBadgeColor}
                        formatStatus={formatStatus}
                        isUpdating={updateTaskStatusMutation.isPending}
                        isDeleting={deleteTaskMutation.isPending}
                      />
                    ))}
                  </TableBody>
                </SortableContext>
              </Table>
            </div>
          </DndContext>
        )}
      </CardContent>
      
      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm
              task={editingTask}
              onSuccess={() => {
                setEditingTask(null);
                queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
