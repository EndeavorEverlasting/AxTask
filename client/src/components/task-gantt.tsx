import { useMemo } from "react";
import type { Task } from "@shared/schema";

/**
 * Pure-SVG Gantt chart for the user's tasks.
 *
 * Design:
 * - The free baseline shows a single-lane timeline of task bars with a "today"
 *   marker and the task window on the x-axis. No customization.
 * - When `unlocked` is true (the Gantt Timeline Pack has been redeemed or an
 *   avatar has hit the unlock level), the chart switches to swimlanes grouped
 *   by classification, colors bars by priority, and renders dependency arrows
 *   from `task.dependsOn` entries.
 * - `dimmed` hides labels and drops opacity; used as the ambient layer behind
 *   the analytics page so users see their *own* upcoming work teased under
 *   the KPI cards.
 *
 * Width is driven by the container: inside the SVG everything along the time
 * axis is expressed in percentages, so no ResizeObserver is needed.
 */

export interface TaskGanttProps {
  tasks: Task[];
  /** Customization unlocked by the Gantt Timeline Pack reward. */
  unlocked?: boolean;
  /** Dimmed ambient mode — intended for layering behind other UI. */
  dimmed?: boolean;
  /** Number of days to show from the window start. Defaults to 21. */
  rangeDays?: number;
  /** Override height (px). Auto-computed from row count when omitted. */
  height?: number;
  className?: string;
  emptyHint?: string;
}

export type TaskGanttRange = { start: Date; end: Date };
type Range = TaskGanttRange;

interface LaidOutTask {
  task: Task;
  range: Range;
  row: number;
  lane: string;
}

const EFFORT_TO_MINUTES: Record<number, number> = { 1: 15, 2: 30, 3: 60, 4: 120, 5: 240 };
const DEFAULT_DURATION_MINUTES = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_BAR_MINUTES = 20;

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

function parseToDate(raw: string | null | undefined, fallbackTime?: string | null): Date | null {
  if (!raw) return null;
  const hasTime = /\d{2}:\d{2}/.test(raw);
  const withTime = hasTime ? raw : `${raw}T${(fallbackTime && /\d{2}:\d{2}/.test(fallbackTime) ? fallbackTime : "09:00")}:00`;
  const d = new Date(withTime);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function deriveTaskRange(task: Task): Range | null {
  const start =
    parseToDate(task.startDate ?? null, task.time) ??
    parseToDate(task.date, task.time);
  if (!start) return null;

  const explicitEnd = parseToDate(task.endDate ?? null, null);
  const durationMinutes =
    task.durationMinutes ??
    (typeof task.effort === "number" ? EFFORT_TO_MINUTES[task.effort] ?? DEFAULT_DURATION_MINUTES : DEFAULT_DURATION_MINUTES);

  let end = explicitEnd ?? new Date(start.getTime() + durationMinutes * 60_000);
  const minEnd = new Date(start.getTime() + MIN_BAR_MINUTES * 60_000);
  if (end.getTime() < minEnd.getTime()) end = minEnd;
  return { start, end };
}

function computeWindow(ranges: Range[], rangeDays: number): Range {
  const now = new Date();
  if (ranges.length === 0) {
    return { start: now, end: new Date(now.getTime() + rangeDays * MS_PER_DAY) };
  }
  const minStart = Math.min(...ranges.map((r) => r.start.getTime()));
  const maxEnd = Math.max(...ranges.map((r) => r.end.getTime()));
  // Anchor window to the earlier of "today" or the earliest task so "today"
  // always remains visible; extend to at least `rangeDays`.
  const windowStart = new Date(Math.min(now.getTime(), minStart) - 6 * 60 * 60 * 1000);
  const minSpan = rangeDays * MS_PER_DAY;
  const windowEnd = new Date(Math.max(maxEnd + 6 * 60 * 60 * 1000, windowStart.getTime() + minSpan));
  return { start: windowStart, end: windowEnd };
}

function classificationLabel(task: Task): string {
  return task.classification?.trim() || "Unclassified";
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function TaskGantt(props: TaskGanttProps) {
  const { tasks, unlocked = false, dimmed = false, rangeDays = 21, height, className, emptyHint } = props;

  const { laidOut, window, lanes, windowSpanMs, windowGridLines } = useMemo(() => {
    const withRanges: LaidOutTask[] = [];
    for (const task of tasks) {
      const range = deriveTaskRange(task);
      if (!range) continue;
      withRanges.push({ task, range, row: 0, lane: classificationLabel(task) });
    }

    withRanges.sort((a, b) => a.range.start.getTime() - b.range.start.getTime());

    const laneOrder: string[] = [];
    const laneRowStart = new Map<string, number>();
    if (unlocked) {
      const seen = new Map<string, LaidOutTask[]>();
      for (const item of withRanges) {
        const list = seen.get(item.lane) ?? [];
        list.push(item);
        seen.set(item.lane, list);
      }
      // Stable lane ordering by first appearance.
      for (const item of withRanges) if (!laneOrder.includes(item.lane)) laneOrder.push(item.lane);
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
      });
    }

    const win = computeWindow(
      withRanges.map((r) => r.range),
      rangeDays,
    );
    const spanMs = Math.max(win.end.getTime() - win.start.getTime(), MS_PER_DAY);

    // Build day gridlines, at most ~8 labels to avoid clutter.
    const spanDays = Math.max(1, Math.round(spanMs / MS_PER_DAY));
    const step = Math.max(1, Math.ceil(spanDays / 8));
    const grid: Array<{ d: Date; pct: number }> = [];
    const startDay = new Date(win.start);
    startDay.setHours(0, 0, 0, 0);
    for (let i = 0; i <= spanDays; i += step) {
      const d = new Date(startDay.getTime() + i * MS_PER_DAY);
      const pct = ((d.getTime() - win.start.getTime()) / spanMs) * 100;
      if (pct >= 0 && pct <= 100) grid.push({ d, pct });
    }

    return {
      laidOut: withRanges,
      window: win,
      lanes: unlocked ? laneOrder.map((name) => ({ name, rowStart: laneRowStart.get(name) ?? 0 })) : [],
      windowSpanMs: spanMs,
      windowGridLines: grid,
    };
  }, [tasks, rangeDays, unlocked]);

  const rowHeight = 26;
  const headerHeight = 28;
  const laneGap = unlocked ? 8 : 0;
  const rows = laidOut.length;
  const totalLaneGap = Math.max(0, (lanes.length - 1) * laneGap);
  const autoHeight = headerHeight + rows * rowHeight + totalLaneGap + 8;
  const svgHeight = height ?? Math.max(autoHeight, 120);

  const todayPct = (() => {
    const now = Date.now();
    if (now < window.start.getTime() || now > window.end.getTime()) return null;
    return ((now - window.start.getTime()) / windowSpanMs) * 100;
  })();

  const toXPct = (d: Date) => ((d.getTime() - window.start.getTime()) / windowSpanMs) * 100;

  // Map by task id for dependency arrow lookup.
  const laidOutByTaskId = new Map(laidOut.map((l) => [l.task.id, l]));

  const barY = (row: number, laneIdx: number) => headerHeight + row * rowHeight + laneIdx * laneGap + 4;

  const visibleTasks = laidOut;

  const rowLane = (task: Task) => {
    if (!unlocked) return 0;
    const laneIdx = lanes.findIndex((l) => l.name === classificationLabel(task));
    return laneIdx < 0 ? 0 : laneIdx;
  };

  const rowFromLaidOut = (lo: LaidOutTask) => lo.row;

  if (rows === 0) {
    return (
      <div
        className={`rounded-lg border border-white/10 bg-white/5 p-6 text-center text-xs text-muted-foreground ${className ?? ""}`}
        aria-hidden={dimmed || undefined}
      >
        {emptyHint ?? "No scheduled tasks yet — set a date on a task to see it on the timeline."}
      </div>
    );
  }

  return (
    <div
      className={`relative w-full ${dimmed ? "pointer-events-none select-none" : ""} ${className ?? ""}`}
      aria-hidden={dimmed || undefined}
    >
      <svg
        viewBox={`0 0 100 ${svgHeight}`}
        preserveAspectRatio="none"
        width="100%"
        height={svgHeight}
        role={dimmed ? "presentation" : "img"}
        aria-label={dimmed ? undefined : "Task timeline Gantt chart"}
        style={{ opacity: dimmed ? 0.22 : 1 }}
      >
        <defs>
          <marker
            id="gantt-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Day gridlines */}
        {windowGridLines.map((g, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={g.pct}
              x2={g.pct}
              y1={headerHeight - 4}
              y2={svgHeight - 2}
              stroke="rgba(148, 163, 184, 0.18)"
              strokeWidth="0.12"
              vectorEffect="non-scaling-stroke"
            />
            {!dimmed && (
              <text
                x={g.pct}
                y={headerHeight - 10}
                fontSize="9"
                fill="rgba(148, 163, 184, 0.85)"
                textAnchor="middle"
                style={{ fontFamily: "ui-sans-serif, system-ui", pointerEvents: "none" }}
              >
                {formatDayLabel(g.d)}
              </text>
            )}
          </g>
        ))}

        {/* Swimlane backgrounds when unlocked */}
        {unlocked &&
          lanes.map((lane, laneIdx) => {
            const laneRows = laidOut.filter((l) => l.lane === lane.name).length;
            const y = headerHeight + lane.rowStart * rowHeight + laneIdx * laneGap;
            const h = laneRows * rowHeight;
            return (
              <g key={`lane-${lane.name}`}>
                <rect
                  x={0}
                  y={y}
                  width={100}
                  height={h}
                  fill={laneIdx % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)"}
                />
                {!dimmed && (
                  <text
                    x={0.5}
                    y={y + 10}
                    fontSize="8"
                    fill="rgba(148, 163, 184, 0.9)"
                    style={{ fontFamily: "ui-sans-serif, system-ui", pointerEvents: "none" }}
                  >
                    {truncate(lane.name, 22)}
                  </text>
                )}
              </g>
            );
          })}

        {/* Today marker */}
        {todayPct !== null && (
          <g>
            <line
              x1={todayPct}
              x2={todayPct}
              y1={headerHeight - 6}
              y2={svgHeight - 2}
              stroke="rgba(16, 185, 129, 0.8)"
              strokeWidth="0.22"
              strokeDasharray="1 1"
              vectorEffect="non-scaling-stroke"
            />
            {!dimmed && (
              <text
                x={todayPct}
                y={headerHeight - 18}
                fontSize="9"
                fontWeight="600"
                fill="rgb(16, 185, 129)"
                textAnchor="middle"
                style={{ fontFamily: "ui-sans-serif, system-ui", pointerEvents: "none" }}
              >
                Today
              </text>
            )}
          </g>
        )}

        {/* Task bars */}
        {visibleTasks.map((lo) => {
          const laneIdx = rowLane(lo.task);
          const row = rowFromLaidOut(lo);
          const x1 = Math.max(0, toXPct(lo.range.start));
          const x2 = Math.min(100, toXPct(lo.range.end));
          const width = Math.max(0.4, x2 - x1);
          const y = barY(row, laneIdx);
          const barHeight = rowHeight - 10;
          const fill = unlocked
            ? PRIORITY_FILL[lo.task.priority] ?? "#6366f1"
            : lo.task.status === "completed"
              ? "#10b981"
              : lo.task.status === "in-progress"
                ? "#3b82f6"
                : "#6366f1";
          const opacity = STATUS_OPACITY[lo.task.status] ?? 0.85;
          return (
            <g key={lo.task.id}>
              <rect
                x={x1}
                y={y}
                width={width}
                height={barHeight}
                rx="1"
                ry="1"
                fill={fill}
                opacity={opacity}
              />
              {!dimmed && width > 6 && (
                <text
                  x={x1 + 0.4}
                  y={y + barHeight / 2 + 3}
                  fontSize="9"
                  fill="rgba(255,255,255,0.95)"
                  style={{
                    fontFamily: "ui-sans-serif, system-ui",
                    pointerEvents: "none",
                  }}
                >
                  {truncate(lo.task.activity, Math.max(6, Math.floor(width * 2.2)))}
                </text>
              )}
            </g>
          );
        })}

        {/* Dependency arrows (customization-gated) */}
        {unlocked &&
          visibleTasks.map((lo) => {
            const deps = Array.isArray(lo.task.dependsOn) ? lo.task.dependsOn : [];
            if (deps.length === 0) return null;
            const targetLane = rowLane(lo.task);
            const targetRow = rowFromLaidOut(lo);
            const targetX = Math.max(0, toXPct(lo.range.start));
            const targetY = barY(targetRow, targetLane) + (rowHeight - 10) / 2;
            return (
              <g key={`arrow-${lo.task.id}`} color="rgba(234, 179, 8, 0.8)">
                {deps.map((predId) => {
                  const pred = laidOutByTaskId.get(predId);
                  if (!pred) return null;
                  const predLane = rowLane(pred.task);
                  const predRow = rowFromLaidOut(pred);
                  const sourceX = Math.min(100, toXPct(pred.range.end));
                  const sourceY = barY(predRow, predLane) + (rowHeight - 10) / 2;
                  const midX = Math.min(100, Math.max(sourceX + 0.6, targetX - 0.6));
                  return (
                    <path
                      key={`${lo.task.id}-${predId}`}
                      d={`M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.18"
                      vectorEffect="non-scaling-stroke"
                      markerEnd="url(#gantt-arrow)"
                    />
                  );
                })}
              </g>
            );
          })}
      </svg>
    </div>
  );
}

export default TaskGantt;
