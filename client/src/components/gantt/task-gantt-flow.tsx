import { useEffect, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TaskGanttNodeData } from "./task-gantt-types";
import { TaskGanttDepEdge } from "./task-gantt-dep-edge";
import { TaskGanttHud, type TaskGanttHudProps } from "./task-gantt-hud";
import { TaskGanttNode } from "./task-gantt-node";
import { TaskGanttTodayMarker } from "./task-gantt-today-marker";
import type { Task } from "@shared/schema";

export function FitViewOnLayout({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.18, duration: reduced ? 0 : 240 });
    });
    return () => cancelAnimationFrame(id);
  }, [layoutKey, fitView]);
  return null;
}

const nodeTypes = {
  taskNode: TaskGanttNode,
  todayMarker: TaskGanttTodayMarker,
} as unknown as NodeTypes;

const edgeTypes = {
  ganttDep: TaskGanttDepEdge,
} as const;

export type TaskGanttHudRfProps = Omit<TaskGanttHudProps, "onFitView" | "onToday" | "onZoomReset">;

function GanttHudRfBridge(props: {
  hudProps: TaskGanttHudRfProps;
  worldHeight: number;
  todayX: number | null;
}) {
  const rf = useReactFlow();
  const { hudProps, worldHeight, todayX } = props;
  return (
    <TaskGanttHud
      {...hudProps}
      onFitView={() => rf.fitView({ padding: 0.18 })}
      onToday={() => {
        if (todayX == null) return;
        rf.setCenter(todayX, worldHeight / 2, { zoom: rf.getZoom() });
      }}
      onZoomReset={() => rf.setViewport({ x: 0, y: 0, zoom: 1 })}
    />
  );
}

export interface TaskGanttFlowProps {
  nodes: Node[];
  edges: Edge[];
  layoutKey: string;
  worldHeight: number;
  todayX: number | null;
  /** Called when user clicks a task bar (not the today marker). */
  onOpenTask?: (task: Task) => void;
  hudProps: TaskGanttHudRfProps;
  legendSlot: ReactNode;
}

export function TaskGanttFlow({
  nodes,
  edges,
  layoutKey,
  worldHeight,
  todayX,
  onOpenTask,
  hudProps,
  legendSlot,
}: TaskGanttFlowProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);

  useEffect(() => {
    setRfNodes(nodes);
    setRfEdges(edges);
  }, [layoutKey, nodes, edges, setRfNodes, setRfEdges]);

  const defaultViewport = { x: 0, y: 0, zoom: 1 };

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView={false}
      defaultViewport={defaultViewport}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      zoomOnScroll
      minZoom={0.2}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_e, node) => {
        if (node.id === "__today__" || node.type === "todayMarker") return;
        const data = node.data as unknown as TaskGanttNodeData;
        if (data?.task) onOpenTask?.(data.task);
      }}
    >
      <Panel position="top-right" className="m-2">
        <GanttHudRfBridge hudProps={hudProps} worldHeight={worldHeight} todayX={todayX} />
      </Panel>
      <Panel position="bottom-left" className="m-2 max-w-[min(100%,20rem)]">
        {legendSlot}
      </Panel>
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        className="!bg-card/90 !rounded-lg !border !border-border"
        maskColor="hsl(var(--background) / 0.6)"
        zoomable
        pannable
      />
      <FitViewOnLayout layoutKey={layoutKey} />
    </ReactFlow>
  );
}
