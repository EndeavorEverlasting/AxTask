import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

/** Full-height vertical line in graph coordinates (zooms with the canvas). */
function TaskGanttTodayMarkerInner(_props: NodeProps) {
  return (
    <div
      className="pointer-events-none h-full min-h-[200px] w-[2px] bg-emerald-500/85 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
      aria-hidden
    />
  );
}

export const TaskGanttTodayMarker = memo(TaskGanttTodayMarkerInner);
