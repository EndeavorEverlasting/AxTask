import { TaskCalendar } from "@/components/task-calendar";
import { ImmersivePretextCue } from "@/components/layout/immersive-pretext-cue";
import { GlassPanel } from "@/components/ui/glass-panel";
import { FloatingChip } from "@/components/ui/floating-chip";

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <GlassPanel elevated className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap gap-2">
          <FloatingChip tone="neutral">Calendar rhythm</FloatingChip>
          <FloatingChip tone="success">Drag to rebalance</FloatingChip>
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Calendar View</h2>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
            Visualize and manage tasks on a calendar. Drag tasks between dates to reschedule.
          </p>
        </div>
        <ImmersivePretextCue />
      </GlassPanel>

      <GlassPanel className="p-2 md:p-3">
        <TaskCalendar />
      </GlassPanel>
    </div>
  );
}

