import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Task } from '@shared/schema';
import { 
  type CalendarView, 
  generateTimeBlocks, 
  getTasksInTimeBlock,
  getPriorityColor,
  getPriorityBorderColor,
  type TaskWithTime
} from '@/lib/calendar-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PriorityBadge } from '../priority-badge';
import { ClassificationBadge } from '../classification-badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskForm } from '../task-form';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Clock, Edit, GripVertical } from 'lucide-react';

interface HourlyViewProps {
  tasks: Task[];
  currentDate: Date;
  view: CalendarView;
}

export function HourlyView({ tasks, currentDate, view }: HourlyViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverBlock, setDragOverBlock] = useState<number | null>(null);
  const timeBlocks = generateTimeBlocks(currentDate, view);
  const tasksWithTime = tasks as TaskWithTime[];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleEditTask = () => {
    if (selectedTask) {
      setEditingTask(selectedTask);
      setSelectedTask(null);
    }
  };

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, newTime }: { taskId: string; newTime: string }) => {
      const response = await apiRequest("PUT", `/api/tasks/${taskId}`, { time: newTime });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task rescheduled",
        description: "Your task has been moved to the new time slot.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reschedule task",
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, blockHour: number | undefined) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (blockHour !== undefined) {
      setDragOverBlock(blockHour);
    }
  };

  const handleDragLeave = () => {
    setDragOverBlock(null);
  };

  const handleDrop = (e: React.DragEvent, blockHour: number | undefined) => {
    e.preventDefault();
    setDragOverBlock(null);
    
    if (draggedTask && blockHour !== undefined) {
      const newTime = `${blockHour.toString().padStart(2, '0')}:00`;
      updateTaskMutation.mutate({ taskId: draggedTask.id, newTime });
      setDraggedTask(null);
    }
  };

  return (
    <>
      <ScrollArea className="h-[calc(100vh-16rem)]">
        <div className="p-4 space-y-2">
          {timeBlocks.map((block, idx) => {
            const blockTasks = getTasksInTimeBlock(tasksWithTime, block, currentDate);
            const hasOverflow = blockTasks.length > 3;
            const displayTasks = hasOverflow ? blockTasks.slice(0, 2) : blockTasks;

            return (
              <div
                key={idx}
                onDragOver={(e) => handleDragOver(e, block.hour)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, block.hour)}
                className={`border rounded-lg transition-all ${
                  dragOverBlock === block.hour 
                    ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-lg' 
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-600'
                }`}
                data-testid={`timeblock-${block.hour}`}
              >
                <div className="flex gap-4 p-3">
                  {/* Time Label */}
                  <div className="flex-shrink-0 w-32">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                      <Clock className="h-4 w-4" />
                      {block.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {blockTasks.length} {blockTasks.length === 1 ? 'task' : 'tasks'}
                    </div>
                  </div>

                  {/* Tasks */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {displayTasks.length === 0 ? (
                      <div className="text-sm text-gray-400 dark:text-gray-600 italic py-2">
                        No tasks scheduled
                      </div>
                    ) : (
                      <>
                        {displayTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task)}
                            onDragEnd={() => setDraggedTask(null)}
                            onClick={() => setSelectedTask(task)}
                            className={`p-3 rounded-md cursor-move hover:shadow-md transition-all border-l-4 ${getPriorityBorderColor(task.priority)} ${
                              draggedTask?.id === task.id 
                                ? 'opacity-50 scale-95' 
                                : 'bg-gray-50 dark:bg-gray-750'
                            }`}
                            data-testid={`task-${task.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                    {task.activity}
                                  </div>
                                  {task.notes && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate mt-1">
                                      {task.notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge 
                                  className={`text-xs px-2 py-0 ${task.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300'}`}
                                  data-testid={`status-${task.id}`}
                                >
                                  {task.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                        {hasOverflow && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer">
                            +{blockTasks.length - 2} more tasks
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Task Details Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent data-testid="dialog-task-details">
          {selectedTask && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle>{selectedTask.activity}</DialogTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditTask}
                    data-testid="button-edit-task"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority</h4>
                  <PriorityBadge priority={selectedTask.priority} score={selectedTask.priorityScore / 10} />
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Classification</h4>
                  <ClassificationBadge classification={selectedTask.classification} />
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</h4>
                  <Badge>{selectedTask.status}</Badge>
                </div>
                
                {selectedTask.notes && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{selectedTask.notes}</p>
                  </div>
                )}
                
                {selectedTask.prerequisites && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prerequisites</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{selectedTask.prerequisites}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 mb-1">Urgency</h4>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedTask.urgency || 'N/A'}</div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 mb-1">Impact</h4>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedTask.impact || 'N/A'}</div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 mb-1">Effort</h4>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedTask.effort || 'N/A'}</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-task">
          {editingTask && (
            <TaskForm 
              task={editingTask} 
              onSuccess={() => setEditingTask(null)} 
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
