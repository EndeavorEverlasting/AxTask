import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { GanttEdgeState } from "./task-gantt-types";

function strokeForState(state: GanttEdgeState | undefined): { stroke: string; strokeWidth: number; strokeDasharray?: string } {
  switch (state) {
    case "critical":
      return { stroke: "rgb(239 68 68)", strokeWidth: 2.5 };
    case "completed":
      return { stroke: "rgb(148 163 184)", strokeWidth: 1.5 };
    case "chain":
      return { stroke: "rgb(34 211 238)", strokeWidth: 2.5 };
    case "broken":
      return { stroke: "rgb(239 68 68)", strokeWidth: 1.5, strokeDasharray: "4 4" };
    default:
      return { stroke: "rgb(245 158 11)", strokeWidth: 1.5 };
  }
}

function TaskGanttDepEdgeImpl(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  } = props;
  const state = (data as { state?: GanttEdgeState } | undefined)?.state ?? "normal";
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const style = strokeForState(state);
  return (
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={16} />
  );
}

export const TaskGanttDepEdge = memo(TaskGanttDepEdgeImpl);
