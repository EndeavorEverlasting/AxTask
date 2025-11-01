import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type Task } from '@shared/schema';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { 
  type CalendarView, 
  navigateDateByView, 
  formatCalendarHeader 
} from '@/lib/calendar-utils';
import { HourlyView } from './calendar/hourly-view';
import { DailyView } from './calendar/daily-view';
import { WeeklyView } from './calendar/weekly-view';
import { MonthlyView } from './calendar/monthly-view';

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('week');

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const handleNavigate = (direction: 'prev' | 'next') => {
    setCurrentDate(navigateDateByView(currentDate, direction, view));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const renderView = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Loading calendar...</div>
        </div>
      );
    }

    switch (view) {
      case '1-hour':
      case '2-hour':
      case '4-hour':
      case '8-hour':
        return <HourlyView tasks={tasks} currentDate={currentDate} view={view} />;
      case 'day':
        return <DailyView tasks={tasks} currentDate={currentDate} />;
      case 'week':
        return <WeeklyView tasks={tasks} currentDate={currentDate} />;
      case 'month':
        return <MonthlyView tasks={tasks} currentDate={currentDate} />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full" data-testid="calendar-container">
      <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleNavigate('prev')}
              data-testid="button-prev-period"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              onClick={handleToday}
              className="px-4"
              data-testid="button-today"
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              Today
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleNavigate('next')}
              data-testid="button-next-period"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 ml-4" data-testid="text-calendar-header">
              {formatCalendarHeader(currentDate, view)}
            </h2>
          </div>

          {/* View Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">View:</span>
            <Select value={view} onValueChange={(v) => setView(v as CalendarView)}>
              <SelectTrigger className="w-[180px]" data-testid="select-calendar-view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1-hour" data-testid="option-1-hour">1 Hour</SelectItem>
                <SelectItem value="2-hour" data-testid="option-2-hour">2 Hours</SelectItem>
                <SelectItem value="4-hour" data-testid="option-4-hour">4 Hours</SelectItem>
                <SelectItem value="8-hour" data-testid="option-8-hour">8 Hours</SelectItem>
                <SelectItem value="day" data-testid="option-day">Daily</SelectItem>
                <SelectItem value="week" data-testid="option-week">Weekly</SelectItem>
                <SelectItem value="month" data-testid="option-month">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {renderView()}
      </CardContent>
    </Card>
  );
}
