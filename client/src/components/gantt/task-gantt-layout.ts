import type { Edge, Node } from "@xyflow/react";
import type { Task } from "@shared/schema";
import { deriveTaskRange } from "@/components/task-gantt";
import {
  DAY_WIDTH_BY_MODE,
  LANE_HEIGHT_BY_MODE,
  MIN_NODE_WIDTH_BY_MODE,
  NODE_HEIGHT_BY_MODE,
  type GanttEdgeState,
  type GanttGroupBy,
  type GanttLane,
  type GanttScaleMode,
  type TaskGanttNodeData,
} from "./task-gantt-types";

export interface BuildGanttLayoutOptions {
  tasks: Task[];
  mode: GanttScaleMode;
  groupBy: GanttGroupBy;
  /** Swimlanes + dependency styling — mirrors legacy TaskGantt `unlocked`. */
  unlocked: boolean;
  rangeDays?: number;
  windowStart?: Date;
  windowEnd?: Date;
  criticalIds?: ReadonlySet<string>;
}

export interface BuildGanttLayoutResult {
  nodes: Node<TaskGanttNodeData>[];
  edges: Edge<{ state: GanttEdgeState }>[];
  lanes: GanttLane[];
  windowStart: Date;
  windowEnd: Date;
  worldWidth: number;
  worldHeight: number;
  /** X position of "today" in world coords, or null if outside window. */
  todayX: number | null;
  layoutKey: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type Range = { start: Date; end: Date };

interface LaidOutTask {
  task: Task;
  range: Range;
  row: number;
  lane: string;
}

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

function computeWindow(ranges: Range[], rangeDays: number): Range {
  const now = new Date();
  if (ranges.length === 0) {
    return { start: now, end: new Date(now.getTime() + rangeDays * MS_PER_DAY) };
  }
  const minStart = Math.min(...ranges.map((r) => r.start.getTime()));
  const maxEnd = Math.max(...ranges.map((r) => r.end.getTime()));
  const windowStart = new Date(Math.min(now.getTime(), minStart) - 6 * 60 * 60 * 1000);
  const minSpan = rangeDays * MS_PER_DAY;
  const windowEnd = new Date(Math.max(maxEnd + 6 * 60 * 60 * 1000, windowStart.getTime() + minSpan));
  return { start: windowStart, end: windowEnd };
}

function laneLabel(task: Task, groupBy: GanttGroupBy): string {
  switch (groupBy) {
    case "classification":
      return task.classification?.trim() || "Unclassified";
    case "status":
      return task.status || "pending";
    case "project":
      return "Tasks";
    default:
      return "Tasks";
  }
}

function countBlocks(tasks: Task[]): Map<string, number> {
  const blocks = new Map<string, number>();
  for (const t of tasks) {
    for (const pid of t.dependsOn ?? []) {
      blocks.set(pid, (blocks.get(pid) ?? 0) + 1);
    }
  }
  return blocks;
}

export function buildGanttLayout(opts: BuildGanttLayoutOptions): BuildGanttLayoutResult {
  const {
    tasks,
    mode,
    groupBy,
    unlocked,
    rangeDays = 21,
    criticalIds = new Set(),
  } = opts;

  const dayWidth = DAY_WIDTH_BY_MODE[mode];
  const laneHeight = LANE_HEIGHT_BY_MODE[mode];
  const nodeHeight = NODE_HEIGHT_BY_MODE[mode];
  const minNodeWidth = MIN_NODE_WIDTH_BY_MODE[mode];
  const laneGap = unlocked && groupBy !== "none" ? 12 : 0;

  const withRanges: LaidOutTask[] = [];
  for (const task of tasks) {
    const range = deriveTaskRange(task);
    if (!range) continue;
    withRanges.push({
      task,
      range,
      row: 0,
      lane: unlocked ? laneLabel(task, groupBy) : "Tasks",
    });
  }

  withRanges.sort((a, b) => a.range.start.getTime() - b.range.start.getTime());

  const laneOrder: string[] = [];
  const laneRowStart = new Map<string, number>();

  if (unlocked && groupBy !== "none") {
    const seen = new Map<string, LaidOutTask[]>();
    for (const item of withRanges) {
      const list = seen.get(item.lane) ?? [];
      list.push(item);
      seen.set(item.lane, list);
    }
    for (const item of withRanges) {
      if (!laneOrder.includes(item.lane)) laneOrder.push(item.lane);
    }
    let row = 0;
    for (const lane of laneOrder) {
      laneRowStart.set(lane, row);
      for (const item of seen.get(lane) ?? []) {
        item.row = row;
        row += 1;
      }
    }
  } else {
    withRanges.forEach((item, idx) => {
      item.row = idx;
      item.lane = "Tasks";
    });
    laneOrder.push("Tasks");
    laneRowStart.set("Tasks", 0);
  }

  const lanes: GanttLane[] = unlocked
    ? laneOrder.map((name) => ({ name, rowStart: laneRowStart.get(name) ?? 0 }))
    : [];

  const win =
    opts.windowStart && opts.windowEnd
      ? { start: opts.windowStart, end: opts.windowEnd }
      : computeWindow(
          withRanges.map((w) => w.range),
          rangeDays,
        );

  const spanDays = Math.max(daysBetween(win.start, win.end), 1 / 24);
  const worldWidth = spanDays * dayWidth + 120;

  const rows = withRanges.length;
  const totalLaneGap = Math.max(0, (lanes.length - 1) * laneGap);
  const headerTop = 40;
  const worldHeight = headerTop + rows * laneHeight + totalLaneGap + 48;

  const blocksCount = countBlocks(tasks);
  const taskById = new Map(tasks.map((t) => [t.id, t] as const));

  const laidOutById = new Map(withRanges.map((w) => [w.task.id, w]));

  const laneIdxForTask = (task: Task): number => {
    if (!unlocked || groupBy === "none") return 0;
    const label = laneLabel(task, groupBy);
    const idx = lanes.findIndex((l) => l.name === label);
    return idx < 0 ? 0 : idx;
  };

  const nodes: Node<TaskGanttNodeData>[] = [];
  const now = Date.now();
  const todayX =
    now >= win.start.getTime() && now <= win.end.getTime()
      ? daysBetween(win.start, new Date(now)) * dayWidth
      : null;

  for (const lo of withRanges) {
    const { task, range } = lo;
    const laneIdx = laneIdxForTask(task);
    const row = lo.row;
    const x = daysBetween(win.start, range.start) * dayWidth;
    const barWidth = Math.max(daysBetween(range.start, range.end) * dayWidth, minNodeWidth);
    const y =
      headerTop +
      row * laneHeight +
      laneIdx * laneGap +
      Math.max(0, (laneHeight - nodeHeight) / 2);

    const preds = task.dependsOn ?? [];
    let blockedByCount = 0;
    for (const pid of preds) {
      const p = taskById.get(pid);
      if (p && p.status !== "completed") blockedByCount += 1;
    }
    const isBlocked = blockedByCount > 0;

    const data: TaskGanttNodeData = {
      task,
      range: { start: range.start, end: range.end },
      lane: lo.lane,
      isSelected: false,
      isBlocked,
      isCritical: criticalIds.has(task.id),
      blocksCount: blocksCount.get(task.id) ?? 0,
      blockedByCount,
      mode,
      dimmed: false,
    };

    nodes.push({
      id: task.id,
      type: "taskNode",
      position: { x, y },
      data,
      style: { width: barWidth, height: nodeHeight },
    });
  }

  const edges: Edge<{ state: GanttEdgeState }>[] = [];
  for (const lo of withRanges) {
    const deps = lo.task.dependsOn ?? [];
    for (const predId of deps) {
      if (!laidOutById.has(predId)) continue;
      const predTask = taskById.get(predId);
      const completed = predTask?.status === "completed";
      let state: GanttEdgeState;
      if (completed) state = "completed";
      else if (criticalIds.has(predId) && criticalIds.has(lo.task.id)) state = "critical";
      else state = "normal";

      edges.push({
        id: `dep-${predId}-${lo.task.id}`,
        source: predId,
        target: lo.task.id,
        type: "ganttDep",
        data: { state },
      });
    }
  }

  const layoutKey = [
    win.start.toISOString(),
    win.end.toISOString(),
    mode,
    groupBy,
    unlocked,
    tasks.map((t) => `${t.id}:${t.updatedAt}`).join("|"),
    [...criticalIds].sort().join(","),
  ].join("::");

  return {
    nodes,
    edges,
    lanes,
    windowStart: win.start,
    windowEnd: win.end,
    worldWidth,
    worldHeight,
    todayX,
    layoutKey,
  };
}
