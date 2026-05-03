import type { Task } from "@shared/schema";

/** Horizontal density + vertical rhythm for the virtual canvas. */
export type GanttScaleMode = "compact" | "readable" | "detailed";

export type GanttGroupBy = "classification" | "status" | "project" | "none";

export type GanttTimelineScope =
  | "all"
  | "this-week"
  | "next-21-days"
  | "certification"
  | "pmp-sprint"
  | "blocked"
  | "hard-deadlines";

export const DAY_WIDTH_BY_MODE: Record<GanttScaleMode, number> = {
  compact: 36,
  readable: 72,
  detailed: 112,
};

export const LANE_HEIGHT_BY_MODE: Record<GanttScaleMode, number> = {
  compact: 44,
  readable: 72,
  detailed: 112,
};

export const NODE_HEIGHT_BY_MODE: Record<GanttScaleMode, number> = {
  compact: 24,
  readable: 44,
  detailed: 76,
};

export const MIN_NODE_WIDTH_BY_MODE: Record<GanttScaleMode, number> = {
  compact: 72,
  readable: 140,
  detailed: 220,
};

/** React Flow expects node `data` to extend Record<string, unknown>. */
export type TaskGanttNodeData = {
  task: Task;
  range: { start: Date; end: Date };
  lane: string;
  isSelected: boolean;
  isBlocked: boolean;
  isCritical: boolean;
  blocksCount: number;
  blockedByCount: number;
  mode: GanttScaleMode;
  dimmed: boolean;
} & Record<string, unknown>;

export type GanttEdgeState = "normal" | "critical" | "completed" | "broken" | "chain";

export interface GanttLane {
  name: string;
  rowStart: number;
}
