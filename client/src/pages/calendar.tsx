import { TaskCalendar } from "@/components/task-calendar";

export default function CalendarPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Calendar View</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Visualize and manage tasks on a calendar. Drag tasks between dates to reschedule.
        </p>
      </div>

      <TaskCalendar />
    </div>
  );
}

