import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PriorityBadge } from "./priority-badge";
import { ClassificationBadge } from "./classification-badge";
import { TaskForm } from "./task-form";
import { Search, Check, Trash2, RotateCcw, ChevronUp, ChevronDown, GripVertical, Sparkles } from "lucide-react";
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
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type SortField = 'date' | 'priority' | 'activity' | 'classification' | 'priorityScore' | 'status' | 'manual';
type SortDirection = 'asc' | 'desc';

const VIRTUALIZE_THRESHOLD = 100;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

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

const MotionTableRow = motion.create(TableRow);

const rowVariants = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
};

const rowVariantsReduced = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

const SortableTaskRow = memo(function SortableTaskRow({
  task,
  isDragMode,
  onEdit,
  onToggleStatus,
  onDelete,
  isUpdating,
  isDeleting,
  reducedMotion,
}: {
  task: Task;
  isDragMode: boolean;
  onEdit: (task: Task) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
  reducedMotion: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !isDragMode,
    transition: {
      duration: 250,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    },
  });

  const [flash, setFlash] = useState<"status" | "priority" | null>(null);
  const prevStatus = useRef(task.status);
  const prevPriority = useRef(task.priority);

  useEffect(() => {
    if (prevStatus.current !== task.status) {
      prevStatus.current = task.status;
      if (!reducedMotion) {
        setFlash("status");
        const t = setTimeout(() => setFlash(null), 400);
        return () => clearTimeout(t);
      }
    }
  }, [task.status, reducedMotion]);

  useEffect(() => {
    if (prevPriority.current !== task.priority) {
      prevPriority.current = task.priority;
      if (!reducedMotion) {
        setFlash("priority");
        const t = setTimeout(() => setFlash(null), 400);
        return () => clearTimeout(t);
      }
    }
  }, [task.priority, reducedMotion]);

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
  };

  const flashClass = flash === "status"
    ? "animate-[task-flash-status_0.4s_ease-out]"
    : flash === "priority"
    ? "animate-[task-flash-priority_0.4s_ease-out]"
    : "";

  const variants = reducedMotion ? rowVariantsReduced : rowVariants;

  return (
    <MotionTableRow
      ref={setNodeRef}
      style={dragStyle}
      layout={!reducedMotion}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, type: "spring", stiffness: 400, damping: 30 }}
      className={`hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${isDragging ? `bg-blue-50 dark:bg-blue-900/20 shadow-lg ${reducedMotion ? "" : "scale-[1.02]"}` : ""} ${flashClass}`}
      onClick={() => !isDragMode && onEdit(task)}
    >
      {isDragMode && (
        <TableCell className="w-8">
          <button
            {...attributes}
            {...listeners}
            className={`cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded ${reducedMotion ? "" : "transition-transform active:scale-110"}`}
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
        {(task.priorityScore / 10).toFixed(3)}
      </TableCell>
      <TableCell>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium motion-safe:transition-colors motion-safe:duration-300 ${getStatusBadgeColor(task.status)}`}>
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
    </MotionTableRow>
  );
}, (prev, next) => {
  return (
    prev.task === next.task &&
    prev.isDragMode === next.isDragMode &&
    prev.isUpdating === next.isUpdating &&
    prev.isDeleting === next.isDeleting &&
    prev.reducedMotion === next.reducedMotion
  );
});

function VirtualizedTaskTable({
  tasks,
  isDragMode,
  onEdit,
  onToggleStatus,
  onDelete,
  isUpdating,
  isDeleting,
  sortField,
  sortDirection,
  handleSort,
}: {
  tasks: Task[];
  isDragMode: boolean;
  onEdit: (task: Task) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  handleSort: (field: SortField) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 52;

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  return (
    <div ref={scrollContainerRef} className="overflow-auto" style={{ maxHeight: '70vh' }}>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-white dark:bg-gray-800">
          <TableRow>
            {isDragMode && <TableHead className="w-8"></TableHead>}
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('date')}>
              <div className="flex items-center">
                Date
                {sortField === 'date' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('priority')}>
              <div className="flex items-center">
                Priority
                {sortField === 'priority' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('activity')}>
              <div className="flex items-center">
                Activity
                {sortField === 'activity' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('classification')}>
              <div className="flex items-center">
                Classification
                {sortField === 'classification' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('priorityScore')}>
              <div className="flex items-center">
                Score
                {sortField === 'priorityScore' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('status')}>
              <div className="flex items-center">
                Status
                {sortField === 'status' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <TableBody>
            {virtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${virtualizer.getVirtualItems()[0].start}px` }} aria-hidden="true">
                <td colSpan={isDragMode ? 8 : 7} />
              </tr>
            )}
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const task = tasks[virtualItem.index];
              return (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  isDragMode={isDragMode}
                  onEdit={onEdit}
                  onToggleStatus={onToggleStatus}
                  onDelete={onDelete}
                  isUpdating={isUpdating}
                  isDeleting={isDeleting}
                  reducedMotion={true}
                />
              );
            })}
            {virtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${virtualizer.getTotalSize() - (virtualizer.getVirtualItems()[virtualizer.getVirtualItems().length - 1].end)}px` }} aria-hidden="true">
                <td colSpan={isDragMode ? 8 : 7} />
              </tr>
            )}
          </TableBody>
        </SortableContext>
      </Table>
    </div>
  );
}

export function TaskList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 200);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>('manual');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDragMode, setIsDragMode] = useState(false);
  const reducedMotion = useReducedMotion();

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSort = useCallback((field: SortField) => {
    if (field === 'manual') {
      setSortField('manual');
      setIsDragMode(true);
      return;
    }
    setIsDragMode(false);
    setSortField(prev => {
      if (prev === field) {
        setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDirection('asc');
      return field;
    });
  }, []);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredAndSortedTasks.findIndex(t => t.id === active.id);
    const newIndex = filteredAndSortedTasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(filteredAndSortedTasks, oldIndex, newIndex);
    queryClient.setQueryData(["/api/tasks"], reordered);
    reorderMutation.mutate(reordered.map(t => t.id));
  };

  const filteredAndSortedTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      const matchesSearch = !debouncedSearchQuery ||
        task.activity.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        task.notes?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        task.classification.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;

      return matchesSearch && matchesPriority && matchesStatus;
    });

    if (sortField === 'manual') {
      return filtered;
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
  }, [tasks, debouncedSearchQuery, priorityFilter, statusFilter, sortField, sortDirection]);

  const handleEdit = useCallback((task: Task) => setEditingTask(task), []);
  const handleToggleStatus = useCallback((id: string, status: string) => {
    updateTaskStatusMutation.mutate({ id, status });
  }, [updateTaskStatusMutation]);
  const handleDelete = useCallback((id: string) => {
    deleteTaskMutation.mutate(id);
  }, [deleteTaskMutation]);

  const useVirtualized = filteredAndSortedTasks.length > VIRTUALIZE_THRESHOLD;

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
            {useVirtualized ? (
              <VirtualizedTaskTable
                tasks={filteredAndSortedTasks}
                isDragMode={isDragMode}
                onEdit={handleEdit}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDelete}
                isUpdating={updateTaskStatusMutation.isPending}
                isDeleting={deleteTaskMutation.isPending}
                sortField={sortField}
                sortDirection={sortDirection}
                handleSort={handleSort}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isDragMode && <TableHead className="w-8"></TableHead>}
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('date')}>
                        <div className="flex items-center">
                          Date
                          {sortField === 'date' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('priority')}>
                        <div className="flex items-center">
                          Priority
                          {sortField === 'priority' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('activity')}>
                        <div className="flex items-center">
                          Activity
                          {sortField === 'activity' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('classification')}>
                        <div className="flex items-center">
                          Classification
                          {sortField === 'classification' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('priorityScore')}>
                        <div className="flex items-center">
                          Score
                          {sortField === 'priorityScore' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('status')}>
                        <div className="flex items-center">
                          Status
                          {sortField === 'status' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <SortableContext items={filteredAndSortedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <TableBody>
                      <AnimatePresence mode="popLayout">
                        {filteredAndSortedTasks.map((task: Task) => (
                          <SortableTaskRow
                            key={task.id}
                            task={task}
                            isDragMode={isDragMode}
                            onEdit={handleEdit}
                            onToggleStatus={handleToggleStatus}
                            onDelete={handleDelete}
                            isUpdating={updateTaskStatusMutation.isPending}
                            isDeleting={deleteTaskMutation.isPending}
                            reducedMotion={reducedMotion}
                          />
                        ))}
                      </AnimatePresence>
                    </TableBody>
                  </SortableContext>
                </Table>
              </div>
            )}
          </DndContext>
        )}
      </CardContent>
      
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
