import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  memo,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { isShoppingTask } from "@shared/shopping-tasks";
import {
  isBrowserOnline,
  syncDeleteTask,
  syncRawTaskRequest,
  syncReorderTasks,
  syncUpdateTask,
  TaskSyncAbortedError,
} from "@/lib/task-sync-api";
import { apiFetch } from "@/lib/queryClient";
import { resolveTaskListSearchSource } from "@/lib/task-list-search-source";
import { useToast } from "@/hooks/use-toast";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { useImmersiveSounds } from "@/hooks/use-immersive-sounds";
import { useVoice } from "@/hooks/use-voice";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { GlassPanel } from "@/components/ui/glass-panel";
import { FloatingChip } from "@/components/ui/floating-chip";
import { AvatarGlowChip } from "@/components/ui/avatar-glow-chip";
import { ProgressStrip } from "@/components/ui/progress-strip";
import { PriorityBadge } from "./priority-badge";
import { ClassificationBadge } from "./classification-badge";
import { TaskForm } from "./task-form";
import { Search, Check, Trash2, RotateCcw, ChevronUp, ChevronDown, GripVertical, Sparkles, CalendarDays, RefreshCw, Loader2 as RefreshLoader, Repeat } from "lucide-react";
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
import { ClassificationConfirm } from "./classification-confirm";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { benchmarkPretext, estimateTextLayout } from "@/lib/pretext-layout";

/** Minimal inline markdown renderer — handles **bold**, *italic*, `code`, and - list items. */
function renderMarkdownInline(text: string): React.ReactNode {
  // Split by lines for list support
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isList = /^[-*]\s/.test(line.trim());
    const content = isList ? line.trim().slice(2) : line;

    // Inline formatting: **bold**, *italic*, `code`
    const parts: React.ReactNode[] = [];
    let remaining = content;
    let key = 0;
    const inlineRe = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/;
    while (remaining) {
      const m = inlineRe.exec(remaining);
      if (!m) { parts.push(remaining); break; }
      if (m.index > 0) parts.push(remaining.slice(0, m.index));
      if (m[2]) parts.push(<strong key={key++}>{m[2]}</strong>);
      else if (m[3]) parts.push(<em key={key++}>{m[3]}</em>);
      else if (m[4]) parts.push(<code key={key++} className="px-1 py-0.5 bg-muted rounded text-[0.85em]">{m[4]}</code>);
      remaining = remaining.slice(m.index + m[0].length);
    }

    if (isList) {
      elements.push(<span key={`l${i}`} className="block pl-3">• {parts}</span>);
    } else {
      if (i > 0) elements.push(<br key={`br${i}`} />);
      elements.push(<span key={`s${i}`}>{parts}</span>);
    }
  }
  return <>{elements}</>;
}

type SortField = 'date' | 'priority' | 'activity' | 'classification' | 'priorityScore' | 'status' | 'createdAt' | 'updatedAt' | 'manual';
type SortDirection = 'asc' | 'desc';

type AvatarSupportProfile = {
  id: string;
  avatarKey: string;
  displayName: string;
  archetypeKey: string;
  level: number;
  xp: number;
  totalXp: number;
  mission: string;
};

type AvatarSupportSkill = {
  skillKey: string;
  currentLevel: number;
  effectType: string;
  effectPerLevel: number;
};

function taskTimestampMs(value: unknown): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatTaskTimestamp(value: unknown): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value as string);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

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
  shoppingVariant = false,
}: {
  task: Task;
  isDragMode: boolean;
  onEdit: (task: Task) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
  reducedMotion: boolean;
  shoppingVariant?: boolean;
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
    ? "axtask-animate-task-flash-status"
    : flash === "priority"
    ? "axtask-animate-task-flash-priority"
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
      <TableCell className="font-mono text-sm">
        <div className="flex items-center gap-1.5">
          {task.date}
          {task.recurrence && task.recurrence !== "none" && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              <Repeat className="h-3 w-3" />
              {task.recurrence}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-[140px] font-mono text-xs text-muted-foreground whitespace-nowrap">
        {formatTaskTimestamp(task.createdAt)}
      </TableCell>
      <TableCell className="max-w-[140px] font-mono text-xs text-muted-foreground whitespace-nowrap">
        {formatTaskTimestamp(task.updatedAt)}
      </TableCell>
      <TableCell>
        <PriorityBadge priority={task.priority} />
      </TableCell>
      <TableCell className="max-w-md">
        <div className="truncate">{task.activity}</div>
        {task.notes && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {renderMarkdownInline(task.notes)}
          </div>
        )}
        <div className="mt-1 text-[10px] text-gray-400">
          Pretext est: {estimateTextLayout(`${task.activity} ${task.notes || ""}`, 320).lines} line(s)
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <ClassificationBadge
            classification={task.classification}
            classificationAssociations={task.classificationAssociations}
            taskId={task.id}
            activity={task.activity}
            notes={task.notes ?? ""}
            editable
          />
          <ClassificationConfirm taskId={task.id} classification={task.classification} compact />
        </div>
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
            aria-label={
              shoppingVariant
                ? task.status === "completed"
                  ? "Mark as not purchased"
                  : "Mark as purchased"
                : task.status === "completed"
                  ? "Mark as not complete"
                  : "Mark complete"
            }
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
    prev.reducedMotion === next.reducedMotion &&
    prev.shoppingVariant === next.shoppingVariant
  );
});

function VirtualizedTaskTable({
  tasks,
  isDragMode,
  onEdit,
  onToggleStatus,
  onDelete,
  isUpdatingRow,
  isDeletingRow,
  reducedMotion,
  sortField,
  sortDirection,
  handleSort,
  shoppingVariant = false,
}: {
  tasks: Task[];
  isDragMode: boolean;
  onEdit: (task: Task) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  isUpdatingRow: (taskId: string) => boolean;
  isDeletingRow: (taskId: string) => boolean;
  reducedMotion: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  handleSort: (field: SortField) => void;
  shoppingVariant?: boolean;
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
      <Table containerClassName="overflow-visible max-h-none">
        <TableHeader className="sticky top-0 z-10 bg-white dark:bg-gray-800">
          <TableRow>
            {isDragMode && <TableHead className="w-8"></TableHead>}
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('date')}>
              <div className="flex items-center">
                Date
                {sortField === 'date' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('createdAt')}>
              <div className="flex items-center">
                Created
                {sortField === 'createdAt' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('updatedAt')}>
              <div className="flex items-center">
                Updated
                {sortField === 'updatedAt' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
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
            <TableHead
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none"
              onClick={() => handleSort('priorityScore')}
              title="Priority engine score in 0–10 units (stored as ×10 in the database). Same scale as dashboard “avg priority”."
            >
              <div className="flex items-center">
                Priority (0–10)
                {sortField === 'priorityScore' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('status')}>
              <div className="flex items-center">
                {shoppingVariant ? "Purchased" : "Status"}
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
                <td colSpan={isDragMode ? 10 : 9} />
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
                  isUpdating={isUpdatingRow(task.id)}
                  isDeleting={isDeletingRow(task.id)}
                  reducedMotion={reducedMotion}
                  shoppingVariant={shoppingVariant}
                />
              );
            })}
            {virtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${virtualizer.getTotalSize() - (virtualizer.getVirtualItems()[virtualizer.getVirtualItems().length - 1].end)}px` }} aria-hidden="true">
                <td colSpan={isDragMode ? 10 : 9} />
              </tr>
            )}
          </TableBody>
        </SortableContext>
      </Table>
    </div>
  );
}

function MobileTaskCard({
  task,
  onEdit,
  onToggleStatus,
  onDelete,
  isUpdating,
  isDeleting,
  shoppingVariant = false,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
  shoppingVariant?: boolean;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const suppressClickUntilRef = useRef(0);
  const suppressClickTimeoutRef = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 80;

  useEffect(() => {
    return () => {
      if (suppressClickTimeoutRef.current != null) {
        clearTimeout(suppressClickTimeoutRef.current);
        suppressClickTimeoutRef.current = null;
      }
    };
  }, []);

  const handleTouchStart = (e: ReactTouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    setSwiping(false);
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dy) > Math.abs(dx) && !swiping) return;
    if (Math.abs(dx) > 10) setSwiping(true);
    if (swiping) {
      setSwipeX(Math.max(-SWIPE_THRESHOLD * 1.5, Math.min(SWIPE_THRESHOLD * 1.5, dx)));
    }
  };

  const handleTouchEnd = () => {
    if (isUpdating || isDeleting) {
      suppressClickUntilRef.current = Date.now() + 400;
      if (suppressClickTimeoutRef.current != null) {
        clearTimeout(suppressClickTimeoutRef.current);
      }
      suppressClickTimeoutRef.current = window.setTimeout(() => {
        suppressClickUntilRef.current = 0;
        suppressClickTimeoutRef.current = null;
      }, 450) as unknown as number;
      setSwipeX(0);
      setSwiping(false);
      touchStartRef.current = null;
      return;
    }
    let triggeredAction = false;
    if (swipeX > SWIPE_THRESHOLD) {
      suppressClickUntilRef.current = Date.now() + 400;
      onToggleStatus(task.id, task.status === "completed" ? "pending" : "completed");
      triggeredAction = true;
    } else if (swipeX < -SWIPE_THRESHOLD) {
      suppressClickUntilRef.current = Date.now() + 400;
      onDelete(task.id);
      triggeredAction = true;
    }
    setSwipeX(0);
    setSwiping(false);
    touchStartRef.current = null;
    if (triggeredAction) {
      if (suppressClickTimeoutRef.current != null) {
        clearTimeout(suppressClickTimeoutRef.current);
      }
      suppressClickTimeoutRef.current = window.setTimeout(() => {
        suppressClickUntilRef.current = 0;
        suppressClickTimeoutRef.current = null;
      }, 450) as unknown as number;
    }
  };

  const handleCardClick = () => {
    if (swiping || Date.now() < suppressClickUntilRef.current || isUpdating || isDeleting) return;
    onEdit(task);
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-y-0 left-0 w-24 flex items-center justify-center bg-green-500 rounded-l-xl">
        <Check className="h-6 w-6 text-white" />
      </div>
      <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-center bg-red-500 rounded-r-xl">
        <Trash2 className="h-6 w-6 text-white" />
      </div>
      <div
        className="relative p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl transition-transform"
        style={{ transform: `translateX(${swipeX}px)`, transition: swiping ? "none" : "transform 0.3s ease" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{task.activity}</p>
            {task.notes && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{renderMarkdownInline(task.notes)}</p>
            )}
          </div>
          <PriorityBadge priority={task.priority} />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <CalendarDays className="h-3 w-3" />
            {task.date}
          </span>
          {task.time && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{task.time}</span>
          )}
          {task.recurrence && task.recurrence !== "none" && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              <Repeat className="h-3 w-3" />
              {task.recurrence}
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadgeColor(task.status)}`}>
            {formatStatus(task.status)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          <ClassificationBadge
            classification={task.classification}
            classificationAssociations={task.classificationAssociations}
            taskId={task.id}
            activity={task.activity}
            notes={task.notes ?? ""}
            editable
          />
          <ClassificationConfirm taskId={task.id} classification={task.classification} compact />
        </div>
        <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 min-h-[44px] text-xs"
            onClick={() => onToggleStatus(task.id, task.status === "completed" ? "pending" : "completed")}
            disabled={isUpdating}
          >
            <Check className="h-4 w-4 mr-1" />
            {shoppingVariant
              ? task.status === "completed"
                ? "Not purchased"
                : "Mark purchased"
              : task.status === "completed"
                ? "Undo"
                : "Done"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => onDelete(task.id)}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MobileVirtualizedTaskList({
  getScrollElement,
  tasks,
  updatingTaskIds,
  deletingTaskIds,
  onEdit,
  onToggleStatus,
  onDelete,
  shoppingVariant = false,
}: {
  getScrollElement: () => HTMLElement | null;
  tasks: Task[];
  updatingTaskIds: Set<string>;
  deletingTaskIds: Set<string>;
  onEdit: (task: Task) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  shoppingVariant?: boolean;
}) {
  const rowHeight = 118;
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement,
    estimateSize: () => rowHeight,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();
  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {items.map((vi) => {
        const task = tasks[vi.index];
        return (
          <div
            key={task.id}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${vi.start}px)` }}
          >
            <div className="pb-3">
              <MobileTaskCard
                task={task}
                onEdit={onEdit}
                onToggleStatus={onToggleStatus}
                onDelete={onDelete}
                isUpdating={updatingTaskIds.has(task.id)}
                isDeleting={deletingTaskIds.has(task.id)}
                shoppingVariant={shoppingVariant}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function usePullToRefresh(onRefresh: () => Promise<void>, scrollEl: HTMLElement | null) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const pulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const isMounted = useRef(true);
  const PULL_THRESHOLD = 60;

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!scrollEl) return;
    const el = scrollEl;

    const onTouchStart = (e: globalThis.TouchEvent) => {
      if (el.scrollTop <= 0) {
        touchStartY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const onTouchMove = (e: globalThis.TouchEvent) => {
      if (!pulling.current || isRefreshingRef.current) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0 && el.scrollTop <= 0) {
        const next = Math.min(dy * 0.5, PULL_THRESHOLD * 2);
        pullDistanceRef.current = next;
        setPullDistance(next);
        if (dy > 10) e.preventDefault();
      }
    };

    const onTouchEnd = async () => {
      const dist = pullDistanceRef.current;
      if (dist >= PULL_THRESHOLD && !isRefreshingRef.current) {
        setIsRefreshing(true);
        setPullDistance(PULL_THRESHOLD);
        try {
          await onRefresh();
        } catch (err) {
          console.error("[task-list] pull-to-refresh failed", err);
        } finally {
          if (isMounted.current) setIsRefreshing(false);
        }
      }
      pullDistanceRef.current = 0;
      if (isMounted.current) setPullDistance(0);
      pulling.current = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [scrollEl, onRefresh]);

  return { pullDistance, isRefreshing };
}

export type TaskListVariant = "default" | "shopping";

export function TaskList({ variant = "default" }: { variant?: TaskListVariant } = {}) {
  const { toast } = useToast();
  const { playIfEligible } = useImmersiveSounds();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const shoppingUi = variant === "shopping";
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 200);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(() => (shoppingUi ? "pending" : "all"));
  const [sortField, setSortField] = useState<SortField>('manual');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDragMode, setIsDragMode] = useState(false);
  const [pretextStats, setPretextStats] = useState<{ sampleCount: number; totalLines: number; elapsedMs: number } | null>(null);
  const reducedMotion = useReducedMotion();
  const { consumeVoiceSearch } = useVoice();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pullScrollEl, setPullScrollEl] = useState<HTMLDivElement | null>(null);
  const mobileScrollRef = useCallback((node: HTMLDivElement | null) => {
    setPullScrollEl(node);
  }, []);

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
    await new Promise(r => setTimeout(r, 400));
  }, [queryClient]);

  const { pullDistance, isRefreshing } = usePullToRefresh(handlePullRefresh, pullScrollEl);

  useEffect(() => {
    const voiceQuery = consumeVoiceSearch();
    if (voiceQuery) {
      setSearchQuery(voiceQuery);
    }
  }, [consumeVoiceSearch]);

  useEffect(() => {
    const onFocusSearch = () => {
      searchInputRef.current?.focus();
    };
    window.addEventListener("axtask-voice-focus-task-search", onFocusSearch);
    window.addEventListener("axtask-focus-task-search", onFocusSearch);
    return () => {
      window.removeEventListener("axtask-voice-focus-task-search", onFocusSearch);
      window.removeEventListener("axtask-focus-task-search", onFocusSearch);
    };
  }, []);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const scopedTasks = useMemo(
    () => (shoppingUi ? tasks.filter((t) => isShoppingTask(t)) : tasks),
    [tasks, shoppingUi],
  );
  const { data: storageProfile } = useQuery<{
    policy: { maxTasks: number; maxAttachmentBytes: number };
    usage: { taskCount: number; attachmentBytes: number };
  }>({
    queryKey: ["/api/storage/me"],
  });
  const { data: avatarSupportData } = useQuery<{ avatars: AvatarSupportProfile[] }>({
    queryKey: ["/api/gamification/avatars"],
  });
  const { data: avatarSkillData = [] } = useQuery<AvatarSupportSkill[]>({
    queryKey: ["/api/gamification/avatar-skills"],
  });

  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine,
  );
  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const serverQueryTrimmed = debouncedSearchQuery.trim();
  const useServerSearchList = browserOnline && serverQueryTrimmed.length >= 2;

  const {
    data: searchTasks,
    isFetching: isSearchFetching,
    dataUpdatedAt: searchDataUpdatedAt,
  } = useQuery<Task[]>({
    queryKey: ["/api/tasks/search", serverQueryTrimmed],
    queryFn: async ({ queryKey, signal }) => {
      const q = queryKey[1] as string;
      const res = await apiFetch(
        "GET",
        `/api/tasks/search/${encodeURIComponent(q)}`,
        undefined,
        undefined,
        signal,
      );
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json() as Promise<Task[]>;
    },
    enabled: useServerSearchList,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!useServerSearchList) return;
    if (!searchTasks?.length) return;
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
    requestFeedbackNudge("task_search_success");
  }, [useServerSearchList, searchDataUpdatedAt, searchTasks, queryClient]);

  const { baseTasks, applyLocalSearch, serverSearchActive } = useMemo(
    () =>
      resolveTaskListSearchSource({
        browserOnline,
        debouncedQuery: debouncedSearchQuery,
        allTasks: scopedTasks,
        searchResults: useServerSearchList ? searchTasks : undefined,
      }),
    [browserOnline, debouncedSearchQuery, scopedTasks, useServerSearchList, searchTasks],
  );

  useEffect(() => {
    if (serverSearchActive && isDragMode) setIsDragMode(false);
  }, [serverSearchActive, isDragMode]);

  const dragModeEffective = isDragMode && !serverSearchActive;

  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(() => new Set());
  const [deletingTaskIds, setDeletingTaskIds] = useState<Set<string>>(() => new Set());

  const deleteTaskMutation = useMutation({
    mutationFn: async ({ id, baseTask }: { id: string; baseTask?: Task }) => {
      await syncDeleteTask(id, baseTask, queryClient);
    },
    onMutate: ({ id }) => {
      setDeletingTaskIds((prev) => new Set(prev).add(id));
    },
    onSettled: (_d, _e, variables) => {
      const id = variables?.id;
      if (!id) return;
      setDeletingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onSuccess: () => {
      if (isBrowserOnline()) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      }
      toast({
        title: "Task deleted",
        description: "The task has been removed successfully.",
      });
    },
    onError: (e: unknown) => {
      if (e instanceof TaskSyncAbortedError) return;
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ id, status, baseTask }: { id: string; status: string; baseTask?: Task }) => {
      return syncUpdateTask(id, { status }, baseTask, queryClient);
    },
    onMutate: ({ id }) => {
      setUpdatingTaskIds((prev) => new Set(prev).add(id));
    },
    onSettled: (_d, _e, variables) => {
      const id = variables?.id;
      if (!id) return;
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onSuccess: (data, variables) => {
      const d = data as {
        offlineQueued?: boolean;
        coinReward?: unknown;
        coinSkipReason?: string | null;
        walletBalance?: number | null;
      } | undefined;
      if (d?.offlineQueued) {
        toast({
          title: "Saved offline",
          description: "Status will sync when you're back online.",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      if (typeof d?.walletBalance === "number") {
        queryClient.setQueryData(["/api/gamification/wallet"], (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev;
          return { ...(prev as Record<string, unknown>), balance: d.walletBalance };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      if (d?.coinReward) {
        const cr = d.coinReward as {
          coinsEarned: number;
          newBalance: number;
          streak: number;
          badgesEarned?: unknown[];
          comboCount?: number;
          chainCount24h?: number;
          nextComboBadgeAt?: number | null;
          nextChainBadgeAt?: number | null;
        };
        const badgeText = cr.badgesEarned?.length ? ` 🏅 New badge${cr.badgesEarned.length > 1 ? "s" : ""}!` : "";
        const comboHint =
          typeof cr.nextComboBadgeAt === "number" && typeof cr.comboCount === "number"
            ? ` · Combo ${cr.comboCount}/${cr.nextComboBadgeAt}`
            : "";
        const chainHint =
          typeof cr.nextChainBadgeAt === "number" && typeof cr.chainCount24h === "number"
            ? ` · Chain ${cr.chainCount24h}/${cr.nextChainBadgeAt}`
            : "";
        toast({
          title: `+${cr.coinsEarned} AxCoins earned!`,
          description: `Balance: ${cr.newBalance} · Streak: ${cr.streak} day${cr.streak !== 1 ? "s" : ""}${comboHint}${chainHint}${badgeText}`,
        });
        queryClient.setQueryData(["/api/gamification/wallet"], (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev;
          return { ...(prev as Record<string, unknown>), balance: cr.newBalance };
        });
        playIfEligible(1);
      } else if (typeof d?.walletBalance === "number") {
        queryClient.setQueryData(["/api/gamification/wallet"], (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev;
          return { ...(prev as Record<string, unknown>), balance: d.walletBalance };
        });
      } else if (variables.status === "completed" && d?.coinSkipReason === "already_awarded") {
        toast({
          title: "No new completion coins",
          description: "This task already earned its one-time completion reward.",
        });
        playIfEligible(3);
      } else if (variables.status === "completed" && d?.coinSkipReason === "not_awarded") {
        toast({
          title: "Completed — no coins this time",
          description:
            "The server did not award completion coins for this transition. Check your balance after a refresh; if it keeps happening, the completion may not have persisted before the payout step.",
        });
        playIfEligible(3);
      } else {
        toast({
          title: "Task updated",
          description: "Task status has been updated successfully.",
        });
        playIfEligible(3);
      }
      if (variables.status === "completed") {
        requestFeedbackNudge("task_complete");
      }
    },
    onError: (e: unknown) => {
      if (e instanceof TaskSyncAbortedError) return;
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
    },
  });

  const recalculatePrioritiesMutation = useMutation({
    mutationFn: async () => {
      return syncRawTaskRequest("POST", "/api/tasks/recalculate", {}, queryClient);
    },
    onSuccess: (data) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({
          title: "Queued",
          description: "Priority recalculation will run when you're online.",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      const payload = data as {
        recalculateReward?: { coins: number; newBalance: number } | null;
      };
      if (payload.recalculateReward && payload.recalculateReward.coins > 0) {
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
        toast({
          title: "Priorities recalculated",
          description: `All task priorities updated. +${payload.recalculateReward.coins} AxCoins (balance ${payload.recalculateReward.newBalance}).`,
          action: (
            <ToastAction
              altText="Rate recalculation"
              onClick={() => rateRecalculateMutation.mutate({ rating: 5 })}
            >
              Rate +5
            </ToastAction>
          ),
        });
      } else {
        toast({
          title: "Priorities recalculated",
          description: "All task priorities have been recalculated successfully.",
        });
      }
      requestFeedbackNudge("recalculate");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to recalculate priorities",
        variant: "destructive",
      });
    },
  });

  const rateRecalculateMutation = useMutation({
    mutationFn: async ({ rating }: { rating: number }) => {
      return syncRawTaskRequest("POST", "/api/tasks/recalculate/rating", { rating }, queryClient);
    },
    onSuccess: (data) => {
      const payload = data as { reward?: { coins: number; newBalance: number } | null; rating?: number };
      if (payload.reward && payload.reward.coins > 0) {
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
        toast({
          title: "Thanks for rating",
          description: `Recalculate rated ${payload.rating ?? 5}/5. +${payload.reward.coins} AxCoins (balance ${payload.reward.newBalance}).`,
        });
      } else {
        toast({
          title: "Rating received",
          description: "Thanks for helping tune urgency recalculation.",
        });
      }
      requestFeedbackNudge("recalculate_rating");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      await syncReorderTasks(taskIds, queryClient);
    },
    onSuccess: () => {
      if (!isBrowserOnline()) {
        toast({
          title: "Order saved offline",
          description: "Will sync when you're back online.",
        });
        return;
      }
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
      setIsDragMode(false);
      return;
    }
    setIsDragMode(false);
    setSortField(prev => {
      if (prev === field) {
        setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      const defaultDir = field === 'createdAt' || field === 'updatedAt' ? 'desc' : 'asc';
      setSortDirection(defaultDir);
      return field;
    });
  }, []);

  const handleAISort = () => {
    const sorted = TaskAIEngine.suggestOptimalOrder(baseTasks);
    const taskIds = sorted.map(t => t.id);
    reorderMutation.mutate(taskIds);
    setSortField('manual');
    setIsDragMode(true);
    toast({
      title: "AI Reorder Applied",
      description: "Tasks reordered by AI based on priority, urgency, and deadlines.",
    });
  };

  const runPretextBenchmark = useCallback(() => {
    const samples = baseTasks.map((t) => `${t.activity} ${t.notes || ""}`);
    setPretextStats(benchmarkPretext(samples, 320));
    toast({
      title: "Pretext benchmark complete",
      description: `Processed ${samples.length} samples.`,
    });
  }, [baseTasks, toast]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (serverSearchActive) return;
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
    const qLower = debouncedSearchQuery.toLowerCase();
    const filtered = baseTasks.filter((task) => {
      const matchesSearch =
        !applyLocalSearch ||
        !debouncedSearchQuery ||
        task.activity.toLowerCase().includes(qLower) ||
        (task.notes?.toLowerCase().includes(qLower) ?? false) ||
        task.classification.toLowerCase().includes(qLower);

      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;

      return matchesSearch && matchesPriority && matchesStatus;
    });

    if (sortField === 'manual') {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      if (sortField === 'date') {
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
      } else if (sortField === 'createdAt' || sortField === 'updatedAt') {
        aValue = taskTimestampMs(a[sortField]);
        bValue = taskTimestampMs(b[sortField]);
      } else if (sortField === 'priority') {
        const priorityOrder = { 'Highest': 5, 'High': 4, 'Medium-High': 3, 'Medium': 2, 'Low': 1 };
        aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
        bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
      } else if (sortField === 'priorityScore') {
        aValue = Number(a.priorityScore) || 0;
        bValue = Number(b.priorityScore) || 0;
      } else {
        aValue = String(a[sortField] ?? "");
        bValue = String(b[sortField] ?? "");
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [baseTasks, applyLocalSearch, debouncedSearchQuery, priorityFilter, statusFilter, sortField, sortDirection]);

  const handleEdit = useCallback((task: Task) => setEditingTask(task), []);
  const handleToggleStatus = useCallback(
    (id: string, status: string) => {
      const baseTask = tasks.find((t) => t.id === id);
      updateTaskStatusMutation.mutate({ id, status, baseTask });
    },
    [updateTaskStatusMutation, tasks],
  );
  const handleDelete = useCallback(
    (id: string) => {
      const baseTask = tasks.find((t) => t.id === id);
      deleteTaskMutation.mutate({ id, baseTask });
    },
    [deleteTaskMutation, tasks],
  );

  const useVirtualized = filteredAndSortedTasks.length > VIRTUALIZE_THRESHOLD;
  const activeEntourageSlots = 1 + (avatarSkillData.find((skill) => skill.skillKey === "entourage-slots")?.currentLevel ?? 0);
  const guidanceDepth = 1 + (avatarSkillData.find((skill) => skill.skillKey === "guidance-depth")?.currentLevel ?? 0);
  const contextPoints = avatarSkillData
    .filter((skill) => skill.effectType === "context_points")
    .reduce((sum, skill) => sum + (skill.currentLevel * skill.effectPerLevel), 0);
  const resourceBudget = avatarSkillData
    .filter((skill) => skill.effectType === "resource_budget")
    .reduce((sum, skill) => sum + (skill.currentLevel * skill.effectPerLevel), 0);

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
    <Card className="glass-panel-elevated">
      <CardHeader className="px-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between">
            <CardTitle>{shoppingUi ? "Shopping list" : "Task List"}</CardTitle>
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handlePullRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:space-x-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              {useServerSearchList && isSearchFetching && searchTasks === undefined ? (
                <RefreshLoader
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
              <Input
                id="task-list-search"
                ref={searchInputRef}
                placeholder={shoppingUi ? "Search shopping items…" : "Search tasks..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 w-full md:w-64 h-10 ${useServerSearchList && isSearchFetching && searchTasks === undefined ? "pr-10" : ""}`}
                aria-label={shoppingUi ? "Search shopping items" : "Search tasks"}
              />
            </div>
            <div className="flex gap-2">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="flex-1 md:w-40 h-10">
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
                <SelectTrigger className="flex-1 md:w-32 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">{shoppingUi ? "Purchased" : "Completed"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isMobile && (
              <div className="flex gap-2 w-full">
                <Select
                  value={sortField}
                  onValueChange={(v) => {
                    if (v === "manual") {
                      setSortField("manual");
                      setIsDragMode(false);
                      return;
                    }
                    handleSort(v as Exclude<SortField, "manual">);
                  }}
                >
                  <SelectTrigger className="flex-1 h-10">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Saved order</SelectItem>
                    <SelectItem value="date">Scheduled date</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="activity">Activity</SelectItem>
                    <SelectItem value="classification">Classification</SelectItem>
                    <SelectItem value="priorityScore">Priority (0–10)</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="createdAt">Created</SelectItem>
                    <SelectItem value="updatedAt">Updated</SelectItem>
                  </SelectContent>
                </Select>
                {sortField !== "manual" && (
                  <Select value={sortDirection} onValueChange={(d) => setSortDirection(d as SortDirection)}>
                    <SelectTrigger className="w-[128px] h-10 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {!isMobile && (
              <div className="flex flex-wrap items-center gap-2 md:space-x-3">
                <Button
                  variant={isDragMode ? "default" : "outline"}
                  size="sm"
                  disabled={serverSearchActive}
                  title={
                    serverSearchActive
                      ? "Clear search or shorten it to reorder the full list with drag mode."
                      : undefined
                  }
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
                <Button variant="outline" size="sm" onClick={runPretextBenchmark}>
                  Pretext Probe
                </Button>
              </div>
            )}
          </div>
        </div>
        {pretextStats && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Pretext benchmark: {pretextStats.sampleCount} samples, {pretextStats.totalLines} lines, {pretextStats.elapsedMs}ms.
          </div>
        )}
        {storageProfile && (
          <div className="mt-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Storage usage: {storageProfile.usage.taskCount}/{storageProfile.policy.maxTasks} tasks,{" "}
              {Math.round((storageProfile.usage.attachmentBytes / Math.max(1, storageProfile.policy.maxAttachmentBytes)) * 100)}% attachment quota
            </span>
          </div>
        )}
        {avatarSupportData?.avatars?.length ? (
          <GlassPanel elevated className="mt-3 p-3">
            <p className="text-sm font-medium">Companion Guidance</p>
            <p className="text-xs text-muted-foreground mt-1">
              Active entourage slots: {activeEntourageSlots} · Guidance depth: {guidanceDepth} · Context points: {contextPoints} · Resource budget: {resourceBudget}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <FloatingChip tone="neutral">Slots {activeEntourageSlots}</FloatingChip>
              <FloatingChip tone="success">Depth {guidanceDepth}</FloatingChip>
              <FloatingChip tone="warning">Context {contextPoints}</FloatingChip>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {avatarSupportData.avatars.slice(0, activeEntourageSlots).map((avatar) => (
                <AvatarGlowChip key={avatar.id} avatarKey={avatar.avatarKey}>
                  {avatar.displayName} L{avatar.level}
                </AvatarGlowChip>
              ))}
            </div>
            <ProgressStrip className="mt-2" tone="success" value={Math.min(100, guidanceDepth * 20)} />
          </GlassPanel>
        ) : null}
      </CardHeader>
      <CardContent className="px-4 md:px-6">
        {filteredAndSortedTasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {tasks.length === 0 ? "No tasks found. Create your first task!" : "No tasks match your filters."}
          </div>
        ) : isMobile ? (
          <div ref={mobileScrollRef} className="relative max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {(pullDistance > 0 || isRefreshing) && (
              <div
                className="flex items-center justify-center overflow-hidden transition-all"
                style={{ height: isRefreshing ? 40 : pullDistance * 0.6 }}
              >
                <RefreshLoader className={`h-5 w-5 text-primary ${isRefreshing ? "animate-spin" : ""}`} style={{ opacity: Math.min(1, pullDistance / 60) }} />
              </div>
            )}
            <div className="space-y-3">
              {filteredAndSortedTasks.length > VIRTUALIZE_THRESHOLD ? (
                <MobileVirtualizedTaskList
                  getScrollElement={() => pullScrollEl}
                  tasks={filteredAndSortedTasks}
                  updatingTaskIds={updatingTaskIds}
                  deletingTaskIds={deletingTaskIds}
                  onEdit={handleEdit}
                  onToggleStatus={handleToggleStatus}
                  onDelete={handleDelete}
                  shoppingVariant={shoppingUi}
                />
              ) : (
                filteredAndSortedTasks.map((task: Task) => (
                  <MobileTaskCard
                    key={task.id}
                    task={task}
                    onEdit={handleEdit}
                    onToggleStatus={handleToggleStatus}
                    onDelete={handleDelete}
                    isUpdating={updatingTaskIds.has(task.id)}
                    isDeleting={deletingTaskIds.has(task.id)}
                    shoppingVariant={shoppingUi}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {useVirtualized ? (
              <VirtualizedTaskTable
                tasks={filteredAndSortedTasks}
                isDragMode={dragModeEffective}
                onEdit={handleEdit}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDelete}
                isUpdatingRow={(id) => updatingTaskIds.has(id)}
                isDeletingRow={(id) => deletingTaskIds.has(id)}
                reducedMotion={reducedMotion}
                sortField={sortField}
                sortDirection={sortDirection}
                handleSort={handleSort}
                shoppingVariant={shoppingUi}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table containerClassName="overflow-visible max-h-none">
                  <TableHeader>
                    <TableRow>
                      {dragModeEffective && <TableHead className="w-8"></TableHead>}
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('date')}>
                        <div className="flex items-center">
                          Date
                          {sortField === 'date' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('createdAt')}>
                        <div className="flex items-center">
                          Created
                          {sortField === 'createdAt' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('updatedAt')}>
                        <div className="flex items-center">
                          Updated
                          {sortField === 'updatedAt' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
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
                      <TableHead
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none"
                        onClick={() => handleSort('priorityScore')}
                        title="Priority engine score in 0–10 units (stored as ×10 in the database). Same scale as dashboard “avg priority”."
                      >
                        <div className="flex items-center">
                          Priority (0–10)
                          {sortField === 'priorityScore' && (sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />)}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 select-none" onClick={() => handleSort('status')}>
                        <div className="flex items-center">
                          {shoppingUi ? "Purchased" : "Status"}
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
                            isDragMode={dragModeEffective}
                            onEdit={handleEdit}
                            onToggleStatus={handleToggleStatus}
                            onDelete={handleDelete}
                            isUpdating={updatingTaskIds.has(task.id)}
                            isDeleting={deletingTaskIds.has(task.id)}
                            reducedMotion={reducedMotion}
                            shoppingVariant={shoppingUi}
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
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl">
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
