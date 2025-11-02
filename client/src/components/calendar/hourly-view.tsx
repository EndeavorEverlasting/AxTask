import { useState } from 'react';
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
import { Clock, Edit } from 'lucide-react';

interface HourlyViewProps {
  tasks: Task[];
  currentDate: Date;
  view: CalendarView;
}

export function HourlyView({ tasks, currentDate, view }: HourlyViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const timeBlocks = generateTimeBlocks(currentDate, view);
  const tasksWithTime = tasks as TaskWithTime[];

  const handleEditTask = () => {
    if (selectedTask) {
      setEditingTask(selectedTask);
      setSelectedTask(null);
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
                className="border rounded-lg bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
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
                            onClick={() => setSelectedTask(task)}
                            className={`p-3 rounded-md cursor-pointer hover:shadow-md transition-all border-l-4 ${getPriorityBorderColor(task.priority)} bg-gray-50 dark:bg-gray-750`}
                            data-testid={`task-${task.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
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
