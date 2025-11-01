import { Calendar } from '@/components/calendar';

export default function CalendarPage() {
  return (
    <div className="h-screen overflow-hidden p-6 space-y-4">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Calendar View
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Visualize and manage your tasks across different time scales
        </p>
      </div>
      
      <div className="h-[calc(100vh-10rem)]">
        <Calendar />
      </div>
    </div>
  );
}
