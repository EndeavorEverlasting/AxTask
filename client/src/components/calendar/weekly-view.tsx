import { useState } from 'react';
import { format } from 'date-fns';
import { type Task } from '@shared/schema';
import { 
  getWeekDays,
  getTasksForDay,
  getPriorityBorderColor,
  getPeriodStats
} from '@/lib/calendar-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '../priority-badge';
import { ClassificationBadge } from '../classification-badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface WeeklyViewProps {
  tasks: Task[];
  currentDate: Date;
}

export function WeeklyView({ tasks, currentDate }: WeeklyViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const weekDays = getWeekDays(currentDate);
  const stats = getPeriodStats(tasks.filter(task => {
    const taskDate = new Date(task.date);
    return weekDays.some(day => 
      day.toDateString() === taskDate.toDateString()
    );
  }));

  return (
    <>
      <div className="p-4">
        {/* Week Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 px-2">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</div>
            <div className="text-xs text-blue-600 dark:text-blue-400">Total</div>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.completed}</div>
            <div className="text-xs text-green-600 dark:text-green-400">Done</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.inProgress}</div>
            <div className="text-xs text-yellow-600 dark:text-yellow-400">In Progress</div>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {stats.completionRate.toFixed(0)}%
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400">Complete</div>
          </div>
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((day, idx) => {
            const dayTasks = getTasksForDay(tasks, day);
            const isToday = day.toDateString() === new Date().toDateString();
            
            return (
              <div
                key={idx}
                className={`border rounded-lg overflow-hidden ${isToday ? 'ring-2 ring-blue-500 dark:ring-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
                data-testid={`day-${format(day, 'yyyy-MM-dd')}`}
              >
                {/* Day Header */}
                <div className={`p-3 text-center border-b ${isToday ? 'bg-blue-500 dark:bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                  <div className={`text-xs font-medium ${isToday ? 'text-blue-100' : 'text-gray-600 dark:text-gray-400'}`}>
                    {format(day, 'EEE')}
                  </div>
                  <div className={`text-2xl font-bold ${isToday ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                    {format(day, 'd')}
                  </div>
                  <div className={`text-xs ${isToday ? 'text-blue-100' : 'text-gray-500 dark:text-gray-500'}`}>
                    {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
                  </div>
                </div>

                {/* Tasks */}
                <ScrollArea className="h-64 p-2">
                  <div className="space-y-2">
                    {dayTasks.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="text-xs text-gray-400 dark:text-gray-600">No tasks</div>
                      </div>
                    ) : (
                      dayTasks.slice(0, 5).map((task) => (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className={`p-2 rounded cursor-pointer hover:shadow-md transition-all border-l-2 ${getPriorityBorderColor(task.priority)} bg-white dark:bg-gray-750`}
                          data-testid={`task-${task.id}`}
                        >
                          <div className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                            {task.activity}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge className="text-[10px] px-1 py-0 h-4">{task.classification}</Badge>
                            {task.status === 'completed' && (
                              <Badge className="text-[10px] px-1 py-0 h-4 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✓</Badge>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {dayTasks.length > 5 && (
                      <div className="text-[10px] text-center text-blue-600 dark:text-blue-400 py-1">
                        +{dayTasks.length - 5} more
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Details Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent data-testid="dialog-task-details">
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTask.activity}</DialogTitle>
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
    </>
  );
}
