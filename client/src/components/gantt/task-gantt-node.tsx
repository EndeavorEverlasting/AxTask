import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TaskGanttNodeData } from "./task-gantt-types";
import { NODE_HEIGHT_BY_MODE } from "./task-gantt-types";
import { cn } from "@/lib/utils";

const PRIORITY_FILL: Record<string, string> = {
  Highest: "#ef4444",
  High: "#f97316",
  "Medium-High": "#eab308",
  Medium: "#3b82f6",
  Low: "#64748b",
};

const STATUS_OPACITY: Record<string, number> = {
  pending: 0.85,
  "in-progress": 1,
  completed: 0.45,
};

function formatDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TaskGanttNodeInner(props: NodeProps) {
  const data = props.data as TaskGanttNodeData;
  const { task, range, mode, isSelected, isBlocked, dimmed } = data;
  const fill = PRIORITY_FILL[task.priority] ?? "#6366f1";
  const opacity = STATUS_OPACITY[task.status] ?? 0.85;
  const h = NODE_HEIGHT_BY_MODE[mode];

  const outline =
    isSelected ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background" : isBlocked ? "border border-dashed border-amber-500/80" : "";

  return (
    <>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-border !opacity-0" />
      <div
        className={cn(
          "rounded-md shadow-sm overflow-hidden flex flex-col justify-center px-1.5 border border-white/10",
          outline,
          dimmed && "opacity-[0.28] saturate-[0.65]",
        )}
        style={{
          backgroundColor: fill,
          opacity,
          minHeight: h,
          height: h,
        }}
        data-testid={`gantt-node-${task.id}`}
      >
        {mode === "compact" ? (
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-[9px] font-semibold text-white/95 truncate">{task.priority}</span>
            <span className="text-[8px] text-white/80 capitalize">{task.status.replace("-", " ")}</span>
          </div>
        ) : mode === "readable" ? (
          <>
            <p className="text-[11px] font-semibold leading-tight text-white truncate">{task.activity}</p>
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <span className="text-[9px] text-white/85 capitalize">{task.status.replace("-", " ")}</span>
              <span className="text-[9px] text-white/75 tabular-nums">
                {formatDay(range.start)} – {formatDay(range.end)}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold leading-tight text-white truncate">{task.activity}</p>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[9px] text-white/85">
              <span>{task.classification}</span>
              <span>{task.priority}</span>
              <span className="capitalize">{task.status.replace("-", " ")}</span>
            </div>
            <p className="text-[9px] text-white/75 mt-0.5 tabular-nums">
              {formatDay(range.start)} – {formatDay(range.end)}
              {(data.blocksCount > 0 || data.blockedByCount > 0) && (
                <span className="ml-2">
                  Blocks {data.blocksCount} · Blocked by {data.blockedByCount}
                </span>
              )}
            </p>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-border !opacity-0" />
    </>
  );
}

export const TaskGanttNode = memo(TaskGanttNodeInner);
