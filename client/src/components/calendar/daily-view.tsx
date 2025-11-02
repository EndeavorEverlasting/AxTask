import { useState } from 'react';
import { type Task } from '@shared/schema';
import { 
  getTasksForDay,
  getPriorityColor,
  getPriorityBorderColor,
  getPeriodStats
} from '@/lib/calendar-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PriorityBadge } from '../priority-badge';
import { ClassificationBadge } from '../classification-badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskForm } from '../task-form';
import { CheckCircle2, Clock, AlertTriangle, Edit } from 'lucide-react';

interface DailyViewProps {
  tasks: Task[];
  currentDate: Date;
}

export function DailyView({ tasks, currentDate }: DailyViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const dayTasks = getTasksForDay(tasks, currentDate);
  const stats = getPeriodStats(dayTasks);

  const handleEditTask = () => {
    if (selectedTask) {
      setEditingTask(selectedTask);
      setSelectedTask(null);
    }
  };

  // Group tasks by priority
  const tasksByPriority = {
    'Highest': dayTasks.filter(t => t.priority === 'Highest'),
    'High': dayTasks.filter(t => t.priority === 'High'),
    'Medium-High': dayTasks.filter(t => t.priority === 'Medium-High'),
    'Medium': dayTasks.filter(t => t.priority === 'Medium'),
    'Low': dayTasks.filter(t => t.priority === 'Low'),
  };

  return (
    <>
      <div className="p-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Tasks</div>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</div>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-green-600 dark:text-green-400 font-medium">Completed</div>
                <div className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.completed}</div>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">In Progress</div>
                <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.inProgress}</div>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">Completion Rate</div>
                <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  {stats.completionRate.toFixed(0)}%
                </div>
              </div>
              <div className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-sm">
                %
              </div>
            </div>
          </div>
        </div>

        {/* Tasks by Priority */}
        <ScrollArea className="h-[calc(100vh-20rem)]">
          <div className="space-y-6">
            {Object.entries(tasksByPriority).map(([priority, priorityTasks]) => {
              if (priorityTasks.length === 0) return null;
              
              return (
                <div key={priority} className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {priority} Priority
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {priorityTasks.length}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {priorityTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`p-4 rounded-lg cursor-pointer hover:shadow-lg transition-all border-l-4 ${getPriorityBorderColor(task.priority)} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700`}
                        data-testid={`task-${task.id}`}
                      >
                        <div className="space-y-2">
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
                            {task.activity}
                          </div>
                          
                          {task.notes && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                              {task.notes}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between gap-2 pt-2">
                            <ClassificationBadge classification={task.classification} />
                            <Badge 
                              className={`text-xs ${task.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : task.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300'}`}
                            >
                              {task.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {dayTasks.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 dark:text-gray-600 text-lg">
                  No tasks scheduled for this day
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

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
