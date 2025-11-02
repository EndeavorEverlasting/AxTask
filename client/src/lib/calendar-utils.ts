import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval,
  eachHourOfInterval,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isSameHour,
  addDays,
  addHours,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  parseISO,
  isWithinInterval,
  differenceInMinutes,
  set
} from 'date-fns';
import { type Task } from '@shared/schema';

export type CalendarView = '1-hour' | '2-hour' | '4-hour' | '8-hour' | 'day' | 'week' | 'month';

export interface TimeBlock {
  start: Date;
  end: Date;
  label: string;
  hour?: number;
}

export interface TaskWithTime extends Task {
  duration?: number; // in minutes
}

// Generate time blocks for hourly views
export function generateTimeBlocks(date: Date, view: CalendarView): TimeBlock[] {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const blocks: TimeBlock[] = [];

  if (view === '1-hour') {
    const hours = eachHourOfInterval({ start: dayStart, end: dayEnd });
    return hours.map(hour => ({
      start: hour,
      end: addHours(hour, 1),
      label: format(hour, 'ha'),
      hour: hour.getHours(),
    }));
  } else if (view === '2-hour') {
    for (let i = 0; i < 24; i += 2) {
      const start = set(dayStart, { hours: i });
      const end = addHours(start, 2);
      blocks.push({
        start,
        end,
        label: `${format(start, 'ha')} - ${format(end, 'ha')}`,
        hour: i,
      });
    }
  } else if (view === '4-hour') {
    for (let i = 0; i < 24; i += 4) {
      const start = set(dayStart, { hours: i });
      const end = addHours(start, 4);
      blocks.push({
        start,
        end,
        label: `${format(start, 'ha')} - ${format(end, 'ha')}`,
        hour: i,
      });
    }
  } else if (view === '8-hour') {
    for (let i = 0; i < 24; i += 8) {
      const start = set(dayStart, { hours: i });
      const end = addHours(start, 8);
      blocks.push({
        start,
        end,
        label: `${format(start, 'ha')} - ${format(end, 'ha')}`,
        hour: i,
      });
    }
  }

  return blocks;
}

// Get tasks for a specific time block
export function getTasksInTimeBlock(
  tasks: TaskWithTime[],
  block: TimeBlock,
  targetDate: Date
): TaskWithTime[] {
  return tasks.filter(task => {
    const taskDate = parseISO(task.date);
    
    // Check if task is on the same day
    if (!isSameDay(taskDate, targetDate)) {
      return false;
    }

    // Parse task time (task.time is in HH:MM format from schema)
    const [hours, minutes] = task.time.split(':').map(Number);
    const taskStart = set(taskDate, { hours, minutes });

    // Check if task falls within this time block (half-open interval: [start, end))
    // This ensures tasks at exactly the hour boundary only appear in one block
    return taskStart >= block.start && taskStart < block.end;
  });
}

// Get tasks for a specific day
export function getTasksForDay(tasks: Task[], date: Date): Task[] {
  return tasks.filter(task => {
    const taskDate = parseISO(task.date);
    return isSameDay(taskDate, date);
  });
}

// Get days for week view
export function getWeekDays(date: Date): Date[] {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 }); // Sunday
  const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: weekStart, end: weekEnd });
}

// Get days for month view
export function getMonthDays(date: Date): Date[] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  
  // Include days from previous/next month to fill the calendar grid
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
}

// Calculate task density for a day (for heatmap visualization)
export function calculateDayDensity(tasks: Task[], date: Date): number {
  const dayTasks = getTasksForDay(tasks, date);
  
  // Weight by priority
  const densityScore = dayTasks.reduce((score, task) => {
    const priorityWeight = {
      'Highest': 5,
      'High': 4,
      'Medium-High': 3,
      'Medium': 2,
      'Low': 1,
      'Lowest': 0.5,
    }[task.priority] || 1;
    
    return score + priorityWeight;
  }, 0);

  return densityScore;
}

// Get density level for styling
export function getDensityLevel(density: number): 'none' | 'low' | 'medium' | 'high' | 'very-high' {
  if (density === 0) return 'none';
  if (density <= 3) return 'low';
  if (density <= 8) return 'medium';
  if (density <= 15) return 'high';
  return 'very-high';
}

// Navigation helpers
export function navigateDateByView(date: Date, direction: 'prev' | 'next', view: CalendarView): Date {
  const factor = direction === 'next' ? 1 : -1;
  
  switch (view) {
    case '1-hour':
    case '2-hour':
    case '4-hour':
    case '8-hour':
    case 'day':
      return addDays(date, factor);
    case 'week':
      return addWeeks(date, factor);
    case 'month':
      return addMonths(date, factor);
    default:
      return date;
  }
}

// Format date for calendar header
export function formatCalendarHeader(date: Date, view: CalendarView): string {
  switch (view) {
    case '1-hour':
    case '2-hour':
    case '4-hour':
    case '8-hour':
    case 'day':
      return format(date, 'EEEE, MMMM d, yyyy');
    case 'week':
      const weekStart = startOfWeek(date, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    case 'month':
      return format(date, 'MMMM yyyy');
    default:
      return format(date, 'PPP');
  }
}

// Group tasks by date
export function groupTasksByDate(tasks: Task[]): Map<string, Task[]> {
  const grouped = new Map<string, Task[]>();
  
  tasks.forEach(task => {
    const dateKey = task.date; // Already in YYYY-MM-DD format
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(task);
  });
  
  return grouped;
}

// Get task completion stats for a period
export interface PeriodStats {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  completionRate: number;
  avgPriorityScore: number;
}

export function getPeriodStats(tasks: Task[]): PeriodStats {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;
  const avgPriorityScore = total > 0 
    ? tasks.reduce((sum, t) => sum + t.priorityScore, 0) / total 
    : 0;

  return {
    total,
    completed,
    pending,
    inProgress,
    completionRate,
    avgPriorityScore,
  };
}

// Parse time string to minutes since midnight
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Convert minutes to time string
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Calculate task position in a time block (for visual positioning)
export function calculateTaskPosition(task: TaskWithTime, block: TimeBlock): {
  top: number;
  height: number;
} {
  const blockDurationMinutes = differenceInMinutes(block.end, block.start);
  const taskStartMinutes = timeToMinutes(task.time);
  const blockStartMinutes = block.start.getHours() * 60;
  
  const offsetMinutes = taskStartMinutes - blockStartMinutes;
  const taskDuration = task.duration || 60; // Default 1 hour
  
  const top = (offsetMinutes / blockDurationMinutes) * 100;
  const height = Math.min((taskDuration / blockDurationMinutes) * 100, 100 - top);
  
  return { top, height };
}

// Get priority color for calendar display
export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'Highest':
      return 'bg-red-500 dark:bg-red-600';
    case 'High':
      return 'bg-orange-500 dark:bg-orange-600';
    case 'Medium-High':
      return 'bg-yellow-500 dark:bg-yellow-600';
    case 'Medium':
      return 'bg-blue-500 dark:bg-blue-600';
    case 'Low':
      return 'bg-gray-400 dark:bg-gray-500';
    default:
      return 'bg-gray-300 dark:bg-gray-600';
  }
}

// Get priority border color
export function getPriorityBorderColor(priority: string): string {
  switch (priority) {
    case 'Highest':
      return 'border-red-600 dark:border-red-500';
    case 'High':
      return 'border-orange-600 dark:border-orange-500';
    case 'Medium-High':
      return 'border-yellow-600 dark:border-yellow-500';
    case 'Medium':
      return 'border-blue-600 dark:border-blue-500';
    case 'Low':
      return 'border-gray-500 dark:border-gray-400';
    default:
      return 'border-gray-400 dark:border-gray-500';
  }
}

// Get status color
export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
    case 'in-progress':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400';
    case 'pending':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400';
    default:
      return 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-300';
  }
}
