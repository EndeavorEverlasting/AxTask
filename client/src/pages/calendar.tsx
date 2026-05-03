import { TaskCalendar } from "@/components/task-calendar";
import { ImmersivePretextCue } from "@/components/layout/immersive-pretext-cue";
import { FloatingChip } from "@/components/ui/floating-chip";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <PretextPageHeader
        eyebrow="Calendar"
        title="Calendar View"
        subtitle="Visualize and manage tasks on a calendar. Drag tasks between dates to reschedule."
        chips={
          <>
            <FloatingChip tone="neutral">Calendar rhythm</FloatingChip>
            <FloatingChip tone="success">Drag to rebalance</FloatingChip>
          </>
        }
      >
        <ImmersivePretextCue />
      </PretextPageHeader>

      <div className="glass-panel-glossy p-2 md:p-3">
        <TaskCalendar />
      </div>
    </div>
  );
}
