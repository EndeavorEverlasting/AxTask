import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import { useLocation } from "wouter";
import type { Task } from "@shared/schema";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { buildGanttLayout } from "./task-gantt-layout";
import { computeCriticalTaskIds } from "./task-gantt-critical-path";
import { computeDependencyChain } from "./task-gantt-chain";
import {
  filterTasksForTimelineScope,
  isTaskBlockedByIncompletePred,
} from "./task-gantt-scope-filter";
import { TaskGanttFlow } from "./task-gantt-flow";
import { TaskGanttLegend } from "./task-gantt-legend";
import { TaskGanttDetailDrawer } from "./task-gantt-detail-drawer";
import type { GanttEdgeState, GanttScaleMode, GanttTimelineScope } from "./task-gantt-types";

const VALID_SCOPES: GanttTimelineScope[] = [
  "all",
  "this-week",
  "next-21-days",
  "certification",
  "pmp-sprint",
  "blocked",
  "hard-deadlines",
];

function parseTimelineScope(search: string): GanttTimelineScope {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const v = q.get("scope");
  if (v && (VALID_SCOPES as readonly string[]).includes(v)) return v as GanttTimelineScope;
  return "next-21-days";
}

export interface TaskGanttWorkspaceProps {
  tasks: Task[];
  unlocked: boolean;
}

export function TaskGanttWorkspace({ tasks, unlocked }: TaskGanttWorkspaceProps) {
  const [location, setLocation] = useLocation();
  const [mode, setMode] = useState<GanttScaleMode>(() => (unlocked ? "readable" : "compact"));
  const [scope, setScopeState] = useState<GanttTimelineScope>(() =>
    typeof window !== "undefined" ? parseTimelineScope(window.location.search) : "next-21-days",
  );
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [legendOpen, setLegendOpen] = useState(mode !== "compact");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isMobile = useIsMobile();

  useEffect(() => {
    if (!unlocked) setMode("compact");
  }, [unlocked]);

  useEffect(() => {
    setLegendOpen(mode !== "compact");
  }, [mode]);

  useEffect(() => {
    const next = parseTimelineScope(
      typeof window !== "undefined" ? window.location.search : "",
    );
    setScopeState(next);
  }, [location]);

  const setScope = useCallback(
    (next: GanttTimelineScope) => {
      setScopeState(next);
      const q = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      );
      q.set("scope", next);
      setLocation(`/planner/timeline?${q.toString()}`);
    },
    [setLocation],
  );

  const filteredByScope = useMemo(
    () => filterTasksForTimelineScope(tasks, scope),
    [tasks, scope],
  );

  const filtered = useMemo(() => {
    if (!blockedOnly) return filteredByScope;
    return filteredByScope.filter((t) => isTaskBlockedByIncompletePred(t, filteredByScope));
  }, [filteredByScope, blockedOnly]);

  const criticalIds = useMemo(() => {
    if (!showCriticalPath || !unlocked) return new Set<string>();
    return computeCriticalTaskIds(filtered);
  }, [filtered, showCriticalPath, unlocked]);

  const layout = useMemo(
    () =>
      buildGanttLayout({
        tasks: filtered,
        mode,
        groupBy: unlocked ? "classification" : "none",
        unlocked,
        rangeDays: 21,
        criticalIds,
      }),
    [filtered, mode, unlocked, criticalIds],
  );

  const chainSet = useMemo(() => {
    if (!selectedTask) return null;
    return computeDependencyChain(selectedTask.id, filtered);
  }, [selectedTask, filtered]);

  const nodesMerged = useMemo(() => {
    return layout.nodes.map((n) => {
      const data = n.data as import("./task-gantt-types").TaskGanttNodeData;
      const dimmed =
        !!selectedTask && !!chainSet && data.task && !chainSet.has(data.task.id);
      return {
        ...n,
        data: {
          ...data,
          isSelected: data.task?.id === selectedTask?.id,
          dimmed,
        },
      };
    });
  }, [layout.nodes, selectedTask, chainSet]);

  const edgesMerged = useMemo(() => {
    return layout.edges.map((e) => {
      const base = (e.data ?? {}) as { state?: GanttEdgeState };
      let state: GanttEdgeState = base.state ?? "normal";
      if (selectedTask && chainSet && chainSet.has(e.source) && chainSet.has(e.target)) {
        state = "chain";
      }
      return { ...e, data: { ...base, state } } as Edge;
    });
  }, [layout.edges, selectedTask, chainSet]);

  const nodesWithToday = useMemo(() => {
    if (layout.todayX == null) return nodesMerged;
    const marker = {
      id: "__today__",
      type: "todayMarker",
      position: { x: layout.todayX, y: 0 },
      draggable: false,
      selectable: false,
      focusable: false,
      data: {},
      style: { width: 2, height: layout.worldHeight },
    };
    return [marker, ...nodesMerged];
  }, [layout.todayX, layout.worldHeight, nodesMerged]);

  const hudProps = useMemo(
    () => ({
      mode,
      onModeChange: setMode,
      scope,
      onScopeChange: setScope,
      unlocked,
      showCriticalPath,
      onToggleCriticalPath: setShowCriticalPath,
      blockedOnly,
      onToggleBlockedOnly: setBlockedOnly,
      legendOpen,
      onToggleLegend: () => setLegendOpen((v) => !v),
    }),
    [
      mode,
      scope,
      unlocked,
      showCriticalPath,
      blockedOnly,
      legendOpen,
      setScope,
    ],
  );

  const legendSlot = isMobile ? (
    <p className="text-[10px] text-muted-foreground max-w-[14rem]">
      Toggle <strong>Legend</strong> in the controls above to open the sheet.
    </p>
  ) : (
    <TaskGanttLegend open={legendOpen} onOpenChange={setLegendOpen} />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative gantt-workspace min-h-[420px] h-[min(70vh,640px)] w-full overflow-hidden rounded-xl border bg-muted/20">
        {filtered.length === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 px-4 text-center text-sm text-muted-foreground backdrop-blur-[1px]">
            No tasks match this scope — try another scope or add tasks with dates.
          </div>
        ) : null}
        <ReactFlowProvider>
          <TaskGanttFlow
            nodes={nodesWithToday}
            edges={edgesMerged}
            layoutKey={layout.layoutKey}
            worldHeight={layout.worldHeight}
            todayX={layout.todayX}
            hudProps={hudProps}
            legendSlot={legendSlot}
            onOpenTask={(task) => {
              setSelectedTask(task);
              setDrawerOpen(true);
            }}
          />
        </ReactFlowProvider>
      </div>

      {isMobile ? (
        <Drawer open={legendOpen} onOpenChange={setLegendOpen}>
          <DrawerContent className="max-h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>Timeline legend</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 overflow-y-auto">
              <TaskGanttLegend open onOpenChange={() => setLegendOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}

      <TaskGanttDetailDrawer task={selectedTask} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
