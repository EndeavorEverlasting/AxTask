import { useMemo, useState, useRef, useEffect } from "react";
import type { Task } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

/** Shorter axis text when many ticks + compact axis (see SVG `preserveAspectRatio`). */
function formatAxisDayLabel(d: Date, compact: boolean): string {
  if (!compact) return formatDayLabel(d);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function TaskGantt(props: TaskGanttProps) {
  const { tasks, unlocked = false, dimmed = false, rangeDays = 21, height, className, emptyHint } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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

    // Build day gridlines — cap label count and enforce minimum x-gap so axis
    // text stays separated when the timeline is dense.
    const spanDays = Math.max(1, Math.round(spanMs / MS_PER_DAY));
    const maxTicks = 7;
    const step = Math.max(1, Math.ceil(spanDays / maxTicks));
    const gridRaw: Array<{ d: Date; pct: number }> = [];
    const startDay = new Date(win.start);
    startDay.setHours(0, 0, 0, 0);
    for (let i = 0; i <= spanDays; i += step) {
      const d = new Date(startDay.getTime() + i * MS_PER_DAY);
      const pct = ((d.getTime() - win.start.getTime()) / spanMs) * 100;
      if (pct >= 0 && pct <= 100) gridRaw.push({ d, pct });
    }
    const minPctGap = 6;
    const grid: Array<{ d: Date; pct: number }> = [];
    let prevPct = -Infinity;
    for (const g of gridRaw.sort((a, b) => a.pct - b.pct)) {
      if (g.pct - prevPct < minPctGap) continue;
      grid.push(g);
      prevPct = g.pct;
    }

    return {
      laidOut: withRanges,
      window: win,
      lanes: unlocked ? laneOrder.map((name) => ({ name, rowStart: laneRowStart.get(name) ?? 0 })) : [],
      windowSpanMs: spanMs,
      windowGridLines: grid,
    };
  }, [tasks, rangeDays, unlocked]);

  const rowHeight = 36;
  const headerHeight = 32;
  const laneGap = unlocked ? 12 : 0;
  const rows = laidOut.length;
  const totalLaneGap = Math.max(0, (lanes.length - 1) * laneGap);
  const autoHeight = headerHeight + rows * rowHeight + totalLaneGap + 8;
  const svgHeight = height ?? Math.max(autoHeight, 120);
  const svgWidth = containerWidth || 800;

  const axisTickCount = windowGridLines.length;
  const axisLabelsCompact = axisTickCount > 7;
  const axisLabelFontSize = axisLabelsCompact ? 10 : 12;

  const todayX = (() => {
    const now = Date.now();
    if (now < window.start.getTime() || now > window.end.getTime()) return null;
    return ((now - window.start.getTime()) / windowSpanMs) * svgWidth;
  })();

  const toX = (d: Date) => ((d.getTime() - window.start.getTime()) / windowSpanMs) * svgWidth;

  // Map by task id for dependency arrow lookup.
  const laidOutByTaskId = new Map(laidOut.map((l) => [l.task.id, l]));

  const barY = (row: number, laneIdx: number) => headerHeight + row * rowHeight + laneIdx * laneGap + 6;

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
    <TooltipProvider>
      <div
        ref={containerRef}
        className={`relative w-full ${dimmed ? "pointer-events-none select-none" : ""} ${className ?? ""}`}
        aria-hidden={dimmed || undefined}
      >
        {containerWidth > 0 && (
          <svg
            className="block w-full"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ height: `${svgHeight}px`, opacity: dimmed ? 0.22 : 1 }}
            role={dimmed ? "presentation" : "img"}
            aria-label={dimmed ? undefined : "Task timeline Gantt chart"}
          >
            <defs>
              <marker
                id="gantt-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>

            {/* Day gridlines */}
            {windowGridLines.map((g, i) => {
              const xPos = ((g.pct) / 100) * svgWidth;
              return (
                <g key={`grid-${i}`}>
                  <line
                    x1={xPos}
                    x2={xPos}
                    y1={headerHeight - 4}
                    y2={svgHeight - 2}
                    stroke="rgba(148, 163, 184, 0.15)"
                    strokeWidth="1"
                  />
                  {!dimmed && (
                    <text
                      x={xPos}
                      y={headerHeight - 12}
                      fontSize={axisLabelFontSize}
                      fill="rgba(148, 163, 184, 0.85)"
                      textAnchor="middle"
                      style={{ fontFamily: "ui-sans-serif, system-ui", pointerEvents: "none" }}
                    >
                      {formatAxisDayLabel(g.d, axisLabelsCompact)}
                    </text>
                  )}
                </g>
              );
            })}

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
                      width={svgWidth}
                      height={h}
                      fill={laneIdx % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)"}
                    />
                    {!dimmed && (
                      <text
                        x={8}
                        y={y + 14}
                        fontSize="11"
                        fontWeight="500"
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
        {todayX !== null && (
          <g>
            <line
              x1={todayX}
              x2={todayX}
              y1={headerHeight - 6}
              y2={svgHeight - 2}
              stroke="rgba(16, 185, 129, 0.8)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            {!dimmed && (
              <text
                x={todayX}
                y={headerHeight - 22}
                fontSize="11"
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

        {/* Dependency arrows (rendered BEFORE tasks so they sit underneath) */}
        {unlocked &&
          visibleTasks.map((lo) => {
            const deps = Array.isArray(lo.task.dependsOn) ? lo.task.dependsOn : [];
            if (deps.length === 0) return null;
            const targetLane = rowLane(lo.task);
            const targetRow = rowFromLaidOut(lo);
            const targetX = Math.max(0, toX(lo.range.start));
            const targetY = barY(targetRow, targetLane) + (rowHeight - 12) / 2;
            return (
              <g key={`arrow-${lo.task.id}`} color="rgba(234, 179, 8, 0.7)">
                {deps.map((predId: string) => {
                  const pred = laidOutByTaskId.get(predId);
                  if (!pred) return null;
                  const predLane = rowLane(pred.task);
                  const predRow = rowFromLaidOut(pred);
                  const sourceX = Math.min(svgWidth, toX(pred.range.end));
                  const sourceY = barY(predRow, predLane) + (rowHeight - 12) / 2;
                  const midX = Math.min(svgWidth, Math.max(sourceX + 8, targetX - 8));
                  return (
                    <path
                      key={`${lo.task.id}-${predId}`}
                      d={`M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      markerEnd="url(#gantt-arrow)"
                    />
                  );
                })}
              </g>
            );
          })}

        {/* Task bars */}
        {visibleTasks.map((lo) => {
          const laneIdx = rowLane(lo.task);
          const row = rowFromLaidOut(lo);
          const x1 = Math.max(0, toX(lo.range.start));
          const x2 = Math.min(svgWidth, toX(lo.range.end));
          const width = Math.max(6, x2 - x1);
          const y = barY(row, laneIdx);
          const barHeight = rowHeight - 12;
          const fill = unlocked
            ? PRIORITY_FILL[lo.task.priority] ?? "#6366f1"
            : lo.task.status === "completed"
              ? "#10b981"
              : lo.task.status === "in-progress"
                ? "#3b82f6"
                : "#6366f1";
          const opacity = STATUS_OPACITY[lo.task.status] ?? 0.85;

          const barContent = (
            <g className={!dimmed ? "cursor-pointer hover:brightness-125 transition-all duration-200" : ""}>
              <rect
                x={x1}
                y={y}
                width={width}
                height={barHeight}
                rx="4"
                ry="4"
                fill={fill}
                opacity={opacity}
              />
              {!dimmed && width > 24 && (
                <text
                  x={x1 + 6}
                  y={y + barHeight / 2 + 4}
                  fontSize="12"
                  fontWeight="500"
                  fill="rgba(255,255,255,0.95)"
                  style={{
                    fontFamily: "ui-sans-serif, system-ui",
                    pointerEvents: "none",
                  }}
                >
                  {truncate(lo.task.activity, Math.max(4, Math.floor(width / 7)))}
                </text>
              )}
            </g>
          );

          if (dimmed) return <g key={lo.task.id}>{barContent}</g>;

          return (
            <Tooltip key={lo.task.id} delayDuration={150}>
              <TooltipTrigger asChild>
                {barContent}
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] bg-slate-900 border-slate-700 text-slate-100 shadow-xl z-[100]">
                <div className="space-y-1.5">
                  <p className="font-medium text-sm leading-tight">{lo.task.activity}</p>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{formatDayLabel(lo.range.start)} - {formatDayLabel(lo.range.end)}</span>
                    {unlocked && <span className="uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-slate-800">{lo.task.priority}</span>}
                  </div>
                  <p className="text-xs text-slate-500 capitalize">{lo.task.status.replace("-", " ")}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </svg>
        )}
      </div>
    </TooltipProvider>
  );
}

export default TaskGantt;
