import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "./priority-badge";
import { TaskForm } from "./task-form";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  AlertTriangle,
  CalendarDays,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { TaskAIEngine, type CalendarInsight } from "@/lib/ai-modules";
import { cn } from "@/lib/utils";

type CalendarView = "month" | "week" | "day";

// ── Draggable task pill ────────────────────────────────────────
function DraggableTaskPill({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const priorityColor: Record<string, string> = {
    Highest: "bg-red-500/20 border-red-500 text-red-700 dark:text-red-300",
    High: "bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-300",
    "Medium-High": "bg-yellow-500/20 border-yellow-500 text-yellow-700 dark:text-yellow-300",
    Medium: "bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300",
    Low: "bg-gray-500/20 border-gray-500 text-gray-700 dark:text-gray-300",
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging) onClick();
      }}
      style={{ touchAction: "none" }}
      className={cn(
        "text-xs px-1.5 py-0.5 rounded border cursor-grab active:cursor-grabbing truncate mb-0.5 transition-opacity",
        priorityColor[task.priority] || priorityColor.Low,
        isDragging && "opacity-40",
        task.status === "completed" && "line-through opacity-60"
      )}
      title={task.time ? `${task.time} — ${task.activity}` : task.activity}
    >
      {task.time && <span className="font-semibold mr-0.5">{task.time}</span>}
      {task.activity}
    </div>
  );
}

// ── Droppable calendar cell ────────────────────────────────────
function CalendarCell({
  date,
  isToday,
  isCurrentMonth,
  tasks,
  insight,
  onClickDate,
  onClickTask,
}: {
  date: Date;
  isToday: boolean;
  isCurrentMonth: boolean;
  tasks: Task[];
  insight?: CalendarInsight;
  onClickDate: (date: Date) => void;
  onClickTask: (task: Task) => void;
}) {
  const dateKey = date.toISOString().split("T")[0];
  const { setNodeRef, isOver } = useDroppable({ id: `date-${dateKey}` });

  return (
    <div
      ref={setNodeRef}
      onClick={() => onClickDate(date)}
      className={cn(
        "min-h-[100px] border border-gray-200 dark:border-gray-700 p-1 cursor-pointer transition-colors",
        isToday && "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-400 ring-inset",
        !isCurrentMonth && "bg-gray-50 dark:bg-gray-800/50 opacity-50",
        isOver && "bg-green-50 dark:bg-green-900/20 ring-2 ring-green-400 ring-inset",
        insight?.severity === "critical" && "bg-red-50 dark:bg-red-900/10",
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn(
          "text-xs font-medium",
          isToday ? "text-blue-600 dark:text-blue-400 font-bold" : "text-gray-600 dark:text-gray-400"
        )}>
          {date.getDate()}
        </span>
        {insight && insight.severity === "critical" && (
          <AlertTriangle className="h-3 w-3 text-red-500" title={insight.message} />
        )}
        {tasks.length > 0 && (
          <span className="text-[10px] text-gray-400">{tasks.length}</span>
        )}
      </div>
      <div className="space-y-0.5 overflow-hidden max-h-[72px]">
        {tasks.slice(0, 3).map((task) => (
          <DraggableTaskPill key={task.id} task={task} onClick={() => onClickTask(task)} />
        ))}
        {tasks.length > 3 && (
          <div className="text-[10px] text-gray-400 text-center">+{tasks.length - 3} more</div>
        )}
      </div>
    </div>
  );
}


// ── Main Calendar Component ────────────────────────────────────
export function TaskCalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingForDate, setCreatingForDate] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const response = await apiRequest("PUT", `/api/tasks/${id}`, { date });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task rescheduled", description: "Task moved to the new date." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reschedule task", variant: "destructive" });
    },
  });

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      const key = task.date;
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
    return map;
  }, [tasks]);

  // AI insights for current view
  const insights = useMemo(() => {
    const { start, end } = getViewRange(currentDate, view);
    return TaskAIEngine.getCalendarInsights(tasks, start, end);
  }, [tasks, currentDate, view]);

  const insightsByDate = useMemo(() => {
    const map: Record<string, CalendarInsight> = {};
    for (const i of insights) map[i.date] = i;
    return map;
  }, [insights]);

  // Navigation
  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };

  // Drag-and-drop: reschedule task to new date
  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedTask(null);
    // Delay clearing isDragging so the CalendarCell onClick is suppressed
    setTimeout(() => setIsDragging(false), 100);

    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("date-")) return;

    const targetDate = overId.replace("date-", "");
    const taskId = String(active.id);

    // Don't reschedule to same date
    const task = tasks.find((t) => t.id === taskId);
    if (task?.date === targetDate) return;

    // AI validation
    const validation = TaskAIEngine.validateCalendarMove(tasks, taskId, targetDate);
    if (validation.warning) {
      toast({
        title: "AI Warning",
        description: validation.warning,
      });
    }

    rescheduleMutation.mutate({ id: taskId, date: targetDate });
  };

  const handleDragStart = (event: any) => {
    setIsDragging(true);
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setDraggedTask(task);
  };

  // Guard for cell clicks — don't open create dialog during/after drag
  const handleCellClick = useCallback((date: Date) => {
    if (isDragging) return;
    setCreatingForDate(formatDate(date));
  }, [isDragging]);

  // AI auto-schedule
  const handleAISchedule = () => {
    const suggestions = TaskAIEngine.suggestSchedule(tasks);
    if (suggestions.length === 0) {
      toast({ title: "AI Scheduler", description: "No scheduling suggestions at this time." });
      return;
    }
    // Apply first few suggestions
    for (const s of suggestions.slice(0, 5)) {
      rescheduleMutation.mutate({ id: s.taskId, date: s.suggestedDate });
    }
    toast({
      title: "AI Scheduler Applied",
      description: `Rescheduled ${Math.min(suggestions.length, 5)} tasks to optimal dates.`,
    });
  };

  // Generate days for month view
  const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const headerLabel = view === "month"
    ? currentDate.toLocaleString("default", { month: "long", year: "numeric" })
    : view === "week"
    ? `Week of ${weekDays[0].toLocaleDateString()}`
    : currentDate.toLocaleDateString("default", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Task Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* View toggles */}
            <div className="flex border rounded-lg overflow-hidden">
              {(["month", "week", "day"] as CalendarView[]).map((v) => (
                <Button
                  key={v}
                  variant={view === v ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView(v)}
                  className="rounded-none text-xs capitalize"
                >
                  {v === "month" ? <LayoutGrid className="h-3.5 w-3.5 mr-1" /> :
                   v === "week" ? <List className="h-3.5 w-3.5 mr-1" /> :
                   <CalendarDays className="h-3.5 w-3.5 mr-1" />}
                  {v}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleAISchedule}>
              <Sparkles className="h-4 w-4 mr-1" /> AI Schedule
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center">{headerLabel}</span>
            <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* AI insights summary */}
        {insights.filter((i) => i.severity === "critical").length > 0 && (
          <div className="flex items-center gap-2 mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            {insights.filter((i) => i.severity === "critical").length} overloaded day(s) detected — AI recommends redistributing tasks.
          </div>
        )}
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {view === "month" && (
            <>
              {/* Day names header */}
              <div className="grid grid-cols-7 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((date, i) => {
                  const key = formatDate(date);
                  return (
                    <CalendarCell
                      key={i}
                      date={date}
                      isToday={date.getTime() === today.getTime()}
                      isCurrentMonth={date.getMonth() === currentDate.getMonth()}
                      tasks={tasksByDate[key] || []}
                      insight={insightsByDate[key]}
                      onClickDate={handleCellClick}
                      onClickTask={setEditingTask}
                    />
                  );
                })}
              </div>
            </>
          )}

          {view === "week" && (
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((date, i) => {
                const key = formatDate(date);
                return (
                  <div key={i} className="flex flex-col">
                    <div className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1">
                      {date.toLocaleDateString("default", { weekday: "short", day: "numeric" })}
                    </div>
                    <CalendarCell
                      date={date}
                      isToday={date.getTime() === today.getTime()}
                      isCurrentMonth={true}
                      tasks={tasksByDate[key] || []}
                      insight={insightsByDate[key]}
                      onClickDate={handleCellClick}
                      onClickTask={setEditingTask}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {view === "day" && (
            <div className="space-y-2">
              {(() => {
                const key = formatDate(currentDate);
                const dayTasks = tasksByDate[key] || [];
                return dayTasks.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No tasks for this day.{" "}
                    <button
                      className="text-blue-500 underline"
                      onClick={() => setCreatingForDate(key)}
                    >
                      Create one
                    </button>
                  </div>
                ) : (
                  dayTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setEditingTask(task)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <PriorityBadge priority={task.priority} />
                      <div className="flex-1 min-w-0">
                        <div className={cn("font-medium truncate", task.status === "completed" && "line-through opacity-60")}>
                          {task.activity}
                        </div>
                        {task.notes && (
                          <div className="text-xs text-gray-500 truncate">{task.notes}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {task.status}
                      </Badge>
                    </div>
                  ))
                );
              })()}
            </div>
          )}

          {/* Drag overlay */}
          <DragOverlay>
            {draggedTask && (
              <div className="text-xs px-2 py-1 rounded border bg-white dark:bg-gray-800 shadow-lg border-blue-400 font-medium">
                {draggedTask.activity}
              </div>
            )}
          </DragOverlay>
        </DndContext>
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

      {/* Create Task for Date Dialog */}
      <Dialog open={!!creatingForDate} onOpenChange={() => setCreatingForDate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <Plus className="h-4 w-4 inline mr-2" />
              New Task for {creatingForDate}
            </DialogTitle>
          </DialogHeader>
          <TaskForm
            defaultDate={creatingForDate || undefined}
            onSuccess={() => {
              setCreatingForDate(null);
              queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Utility functions ──────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getMonthDays(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const days: Date[] = [];
  // Fill in days from previous month to start on Sunday
  const startDow = firstDay.getDay();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    date.setHours(0, 0, 0, 0);
    days.push(date);
  }
  // Fill to complete the last week
  while (days.length % 7 !== 0) {
    const nextDate = new Date(days[days.length - 1]);
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(0, 0, 0, 0);
    days.push(nextDate);
  }
  return days;
}

function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function getViewRange(date: Date, view: CalendarView): { start: Date; end: Date } {
  if (view === "month") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start, end };
  } else if (view === "week") {
    const days = getWeekDays(date);
    return { start: days[0], end: days[6] };
  } else {
    return { start: new Date(date), end: new Date(date) };
  }
}
