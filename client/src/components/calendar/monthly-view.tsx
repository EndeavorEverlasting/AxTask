import { useState } from 'react';
import { format } from 'date-fns';
import { type Task } from '@shared/schema';
import { 
  getMonthDays,
  getTasksForDay,
  calculateDayDensity,
  getDensityLevel,
  getPeriodStats
} from '@/lib/calendar-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '../priority-badge';
import { ClassificationBadge } from '../classification-badge';

interface MonthlyViewProps {
  tasks: Task[];
  currentDate: Date;
}

export function MonthlyView({ tasks, currentDate }: MonthlyViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const monthDays = getMonthDays(currentDate);
  const monthTasks = tasks.filter(task => {
    const taskDate = new Date(task.date);
    return taskDate.getMonth() === currentDate.getMonth() && 
           taskDate.getFullYear() === currentDate.getFullYear();
  });
  const stats = getPeriodStats(monthTasks);

  const getDensityColor = (level: string): string => {
    switch (level) {
      case 'very-high':
        return 'bg-red-200 dark:bg-red-900/50';
      case 'high':
        return 'bg-orange-200 dark:bg-orange-900/50';
      case 'medium':
        return 'bg-yellow-200 dark:bg-yellow-900/50';
      case 'low':
        return 'bg-blue-100 dark:bg-blue-900/30';
      default:
        return 'bg-gray-50 dark:bg-gray-800';
    }
  };

  const selectedDayTasks = selectedDate ? getTasksForDay(tasks, selectedDate) : [];

  return (
    <>
      <div className="p-4">
        {/* Month Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</div>
            <div className="text-xs text-blue-600 dark:text-blue-400">Total Tasks</div>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-3xl font-bold text-green-900 dark:text-green-100">{stats.completed}</div>
            <div className="text-xs text-green-600 dark:text-green-400">Completed</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="text-3xl font-bold text-yellow-900 dark:text-yellow-100">{stats.inProgress}</div>
            <div className="text-xs text-yellow-600 dark:text-yellow-400">In Progress</div>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
              {stats.completionRate.toFixed(0)}%
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400">Completion Rate</div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="border rounded-lg overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 bg-gray-100 dark:bg-gray-800">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="p-2 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-0">
            {monthDays.map((day, idx) => {
              const dayTasks = getTasksForDay(tasks, day);
              const density = calculateDayDensity(tasks, day);
              const densityLevel = getDensityLevel(density);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = day.toDateString() === new Date().toDateString();
              
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className={`
                    min-h-24 p-2 border border-gray-200 dark:border-gray-700 cursor-pointer
                    transition-all hover:shadow-lg hover:scale-[1.02] hover:z-10
                    ${isCurrentMonth ? getDensityColor(densityLevel) : 'bg-gray-50/50 dark:bg-gray-850/50 text-gray-400'}
                    ${isToday ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}
                  `}
                  data-testid={`day-${format(day, 'yyyy-MM-dd')}`}
                >
                  <div className="flex flex-col h-full">
                    {/* Date */}
                    <div className={`text-sm font-medium mb-1 ${isToday ? 'bg-blue-500 text-white rounded-full w-7 h-7 flex items-center justify-center' : ''}`}>
                      {format(day, 'd')}
                    </div>
                    
                    {/* Task Count */}
                    {dayTasks.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
                        </div>
                        
                        {/* Task Dots */}
                        <div className="flex gap-1 flex-wrap">
                          {dayTasks.slice(0, 3).map((task, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${
                                task.priority === 'Highest' ? 'bg-red-500' :
                                task.priority === 'High' ? 'bg-orange-500' :
                                task.priority === 'Medium-High' ? 'bg-yellow-500' :
                                task.priority === 'Medium' ? 'bg-blue-500' :
                                'bg-gray-400'
                              }`}
                              title={task.activity}
                            />
                          ))}
                          {dayTasks.length > 3 && (
                            <div className="text-[10px] text-gray-600 dark:text-gray-400">
                              +{dayTasks.length - 3}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Density Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs">
          <span className="text-gray-600 dark:text-gray-400">Task Density:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">None</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-blue-100 dark:bg-blue-900/30 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-yellow-200 dark:bg-yellow-900/50 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-orange-200 dark:bg-orange-900/50 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-red-200 dark:bg-red-900/50 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Very High</span>
          </div>
        </div>
      </div>

      {/* Day Tasks Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <DialogContent className="max-w-2xl" data-testid="dialog-day-tasks">
          {selectedDate && (
            <>
              <DialogHeader>
                <DialogTitle>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</DialogTitle>
              </DialogHeader>
              
              {selectedDayTasks.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-600">
                  No tasks scheduled for this day
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {selectedDayTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      data-testid={`task-${task.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {task.activity}
                          </div>
                          {task.notes && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                              {task.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <PriorityBadge priority={task.priority} />
                          <Badge className={task.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : ''}>
                            {task.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

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
