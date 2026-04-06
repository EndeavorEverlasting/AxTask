import { TaskCalendar } from "@/components/task-calendar";
import { ImmersivePretextCue } from "@/components/layout/immersive-pretext-cue";

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="space-y-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Calendar View</h2>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
            Visualize and manage tasks on a calendar. Drag tasks between dates to reschedule.
          </p>
        </div>
        <ImmersivePretextCue />
      </div>

      <TaskCalendar />
    </div>
  );
}

