import { createContext, memo, useContext, useEffect, useMemo } from "react";
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { cn } from "@/lib/utils";
import { formatSkillEffect } from "@/lib/skill-tree-format";
import {
  buildSkillTreeFlowLayout,
  type SkillFlowNodeData,
} from "@/lib/skill-tree-graph-build";
import type { FeedbackAvatarKey } from "@shared/feedback-avatar-map";
import { resolveFeedbackAvatarKeyForSkillNode } from "@/lib/skill-tree-feedback";
import { FEEDBACK_AVATAR_NAMES } from "@shared/feedback-avatar-map";
import type { SkillNodeDto, SkillTreeKind } from "./skill-tree-view";
import { Coins, Check, Lock, Zap } from "lucide-react";

function normalizeToken(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

type SkillTreeGraphActions = {
  /** Fallback when a DTO has no `domain` (single-tree mode). */
  defaultTree: SkillTreeKind;
  walletBalance: number;
  readOnly: boolean;
  isPending: boolean;
  onUnlock: (skillKey: string, branch: string, domain: SkillTreeKind) => void;
};

const SkillTreeGraphActionsContext = createContext<SkillTreeGraphActions | null>(null);

function useSkillTreeGraphActions(): SkillTreeGraphActions {
  const ctx = useContext(SkillTreeGraphActionsContext);
  if (!ctx) {
    throw new Error("SkillTreeGraphActionsContext missing");
  }
  return ctx;
}

function FitViewOnLayout({ layoutKey }: { layoutKey: string }) {
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

function SkillTreeGradientEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const gradientId = `skillEdgeGrad-${normalizeToken(id)}`;
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(56, 189, 248, 0.92)" />
          <stop offset="45%" stopColor="rgba(167, 139, 250, 0.9)" />
          <stop offset="100%" stopColor="rgba(45, 212, 191, 0.92)" />
        </linearGradient>
      </defs>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: `url(#${gradientId})`,
          strokeWidth: selected ? 2.9 : 2.2,
          opacity: selected ? 0.98 : 0.88,
          filter: "drop-shadow(0 0 5px rgba(56, 189, 248, 0.35))",
        }}
      />
    </>
  );
}

function SkillTreeHud() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <Panel position="bottom-right" className="m-3 w-56 rounded-xl p-2.5 axtask-pretext-hud">
      <p className="text-[10px] uppercase tracking-[0.16em] text-sky-200/80 font-semibold mb-1">
        Flow controls
      </p>
      <div className="space-y-2">
        <div className="space-y-1">
          <span className="block text-[10px] font-medium text-cyan-200/90">Pretext zoom in</span>
          <button
            type="button"
            className="axtask-pretext-interactive axtask-pretext-splash inline-flex w-full items-center justify-between rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-2 py-1.5 text-xs font-semibold text-cyan-100"
            onClick={() => zoomIn({ duration: 180 })}
          >
            <span>Amplify focus</span>
            <span className="text-cyan-300">+</span>
          </button>
        </div>
        <div className="space-y-1">
          <span className="block text-[10px] font-medium text-violet-200/90">Pretext zoom out</span>
          <button
            type="button"
            className="axtask-pretext-interactive axtask-pretext-splash inline-flex w-full items-center justify-between rounded-lg border border-violet-300/30 bg-violet-500/10 px-2 py-1.5 text-xs font-semibold text-violet-100"
            onClick={() => zoomOut({ duration: 180 })}
          >
            <span>Expand context</span>
            <span className="text-violet-300">-</span>
          </button>
        </div>
        <button
          type="button"
          className="axtask-pretext-interactive axtask-pretext-splash inline-flex w-full items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-2 py-1.5 text-xs font-semibold text-emerald-100"
          onClick={() => fitView({ padding: 0.2, duration: 220 })}
        >
          Recenter constellation
        </button>
      </div>
    </Panel>
  );
}

type SkillFlowRfNode = Node<SkillFlowNodeData, "skillNode">;

function SkillTreeFlowNodeImpl({ data }: NodeProps<SkillFlowRfNode>) {
  const { dto } = data;
  const { defaultTree, walletBalance, readOnly, isPending, onUnlock } = useSkillTreeGraphActions();
  const treeKind: SkillTreeKind = dto.domain ?? defaultTree;
  const atMax = dto.currentLevel >= dto.maxLevel;
  const locked = !dto.isAvailable && !dto.isUnlocked;
  const canAfford = dto.nextCost != null && walletBalance >= dto.nextCost;

  let stateLabel: string;
  let stateTone: string;
  let StateIcon = Zap;
  if (atMax) {
    stateLabel = "Maxed";
    stateTone = "text-emerald-600 dark:text-emerald-400 border-emerald-500/40";
    StateIcon = Check;
  } else if (dto.isUnlocked) {
    stateLabel = "Active";
    stateTone = "text-amber-600 dark:text-amber-400 border-amber-500/40";
    StateIcon = Zap;
  } else if (locked) {
    stateLabel = "Locked";
    stateTone = "text-muted-foreground border-border";
    StateIcon = Lock;
  } else {
    stateLabel = "Available";
    stateTone = "text-sky-600 dark:text-sky-400 border-sky-500/40";
    StateIcon = Zap;
  }

  const avatarKey: FeedbackAvatarKey = resolveFeedbackAvatarKeyForSkillNode(
    treeKind,
    dto.skillKey,
    dto.branch,
  );
  const avatarName = FEEDBACK_AVATAR_NAMES[avatarKey];

  return (
    <div
      className={cn(
        "axtask-pretext-interactive axtask-pretext-splash relative overflow-hidden rounded-lg border bg-slate-950/90 shadow-sm w-[260px]",
        "p-2.5",
        locked && "opacity-75",
        treeKind === "offline" && "border-cyan-400/35 shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_10px_20px_-14px_rgba(56,189,248,0.7)]",
        treeKind === "avatar" && "border-violet-400/35 shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_10px_20px_-14px_rgba(139,92,246,0.7)]",
        !locked && !atMax && "after:absolute after:inset-0 after:pointer-events-none after:bg-[radial-gradient(circle_at_15%_10%,rgba(125,211,252,0.16),transparent_55%),radial-gradient(circle_at_80%_90%,rgba(167,139,250,0.14),transparent_60%)]",
        atMax && "shadow-[0_0_0_1px_rgba(16,185,129,0.4),0_0_28px_-10px_rgba(16,185,129,0.8)]",
      )}
      data-testid={`skill-node-${treeKind}-${dto.skillKey}`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-cyan-300/90 !border-0" />
      <div className="flex items-start gap-2">
        <AvatarOrb
          variant={avatarKey}
          size="sm"
          wobble={false}
          label={avatarName}
          className="shrink-0 mt-0.5 shadow-[0_0_14px_-6px_rgba(56,189,248,0.95)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-semibold text-foreground text-xs leading-tight truncate">{dto.name}</h4>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1 py-0.5 text-[9px]",
                stateTone,
              )}
            >
              <StateIcon className="h-2 w-2" aria-hidden />
              {stateLabel}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {dto.description}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatSkillEffect(dto.effectType, dto.effectPerLevel)}
          </p>
          {dto.prerequisiteSkillKey && !dto.isUnlocked && !dto.isAvailable && (
            <p className="text-[9px] text-muted-foreground/80 mt-0.5 italic truncate">
              Requires: {dto.prerequisiteSkillKey}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div
            className="font-semibold tabular-nums text-xs"
            aria-label={`Level ${dto.currentLevel} of ${dto.maxLevel}`}
          >
            {dto.currentLevel}
            <span className="text-muted-foreground">/{dto.maxLevel}</span>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-border/60">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0">
            {dto.nextCost != null ? (
              <>
                <Coins className="h-3 w-3 text-amber-500 shrink-0" aria-hidden />
                <span className="tabular-nums">{dto.nextCost}</span>
                <span className="truncate">next</span>
              </>
            ) : (
              <span>—</span>
            )}
          </span>
          <Button
            size="sm"
            variant={dto.isUnlocked ? "outline" : "default"}
            disabled={atMax || locked || !canAfford || isPending || dto.nextCost == null}
            onClick={() => onUnlock(dto.skillKey, dto.branch, treeKind)}
            className="h-7 px-2 text-[10px]"
            data-testid={`skill-unlock-${treeKind}-${dto.skillKey}`}
          >
            {atMax ? "Maxed" : locked ? "Locked" : dto.isUnlocked ? "Upgrade" : "Unlock"}
          </Button>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-violet-300/90 !border-0" />
    </div>
  );
}

const SkillTreeFlowNode = memo(SkillTreeFlowNodeImpl);

const nodeTypes = { skillNode: SkillTreeFlowNode } as NodeTypes;
const edgeTypes = { skillGradient: SkillTreeGradientEdge } as EdgeTypes;

export interface SkillTreeGraphProps {
  /** Used for theming and as default when DTOs omit `domain`. */
  tree: SkillTreeKind;
  nodes: SkillNodeDto[];
  walletBalance: number;
  readOnly: boolean;
  isPending: boolean;
  onUnlock: (skillKey: string, branch: string, domain: SkillTreeKind) => void;
  /** When true, show region labels for avatar vs idle subgraphs. */
  showRegionPanels?: boolean;
  className?: string;
}

function SkillTreeGraphInner({
  tree,
  nodes,
  walletBalance,
  readOnly,
  isPending,
  onUnlock,
  showRegionPanels,
  className,
}: SkillTreeGraphProps) {
  const { nodes: laidNodes, edges: laidEdges } = useMemo(
    () => buildSkillTreeFlowLayout(nodes),
    [nodes],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(laidNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(laidEdges);

  useEffect(() => {
    setRfNodes(laidNodes);
    setRfEdges(laidEdges);
  }, [laidNodes, laidEdges, setRfNodes, setRfEdges]);

  const layoutKey = useMemo(
    () =>
      nodes
        .map((n) => `${n.skillKey}:${n.currentLevel}:${n.isAvailable}:${n.isUnlocked}`)
        .join("|"),
    [nodes],
  );

  const actions = useMemo(
    () => ({
      defaultTree: tree,
      walletBalance,
      readOnly,
      isPending,
      onUnlock,
    }),
    [tree, walletBalance, readOnly, isPending, onUnlock],
  );

  const showRegions =
    Boolean(showRegionPanels) &&
    nodes.some((n) => n.domain === "avatar" || n.domain === undefined) &&
    nodes.some((n) => n.domain === "offline");

  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 1 }), []);

  return (
    <SkillTreeGraphActionsContext.Provider value={actions}>
      <div
        className={cn(
          "skill-tree-flow axtask-pretext-hud rounded-xl border border-border min-h-[420px] h-[min(70vh,640px)] w-full",
          className,
        )}
        data-testid={`skill-tree-graph-${tree}`}
      >
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
          elementsSelectable={true}
          panOnScroll={false}
          zoomOnScroll={false}
          minZoom={0.35}
          maxZoom={1.35}
        >
          {showRegions ? (
            <>
              <Panel position="top-left" className="m-2 max-w-[min(100%,14rem)] rounded-lg border border-violet-500/25 bg-slate-950/90 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-100/90 shadow-sm">
                Companions &amp; productivity
              </Panel>
              <Panel position="top-right" className="m-2 max-w-[min(100%,14rem)] rounded-lg border border-cyan-500/25 bg-slate-950/90 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/90 shadow-sm">
                Idle generator
              </Panel>
            </>
          ) : null}
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <SkillTreeHud />
          <MiniMap
            className="!bg-slate-950/92 !rounded-lg !border !border-cyan-400/35"
            maskColor="hsl(var(--background) / 0.6)"
            zoomable
            pannable
          />
          <FitViewOnLayout layoutKey={layoutKey} />
        </ReactFlow>
      </div>
    </SkillTreeGraphActionsContext.Provider>
  );
}

export function SkillTreeGraph(props: SkillTreeGraphProps) {
  return (
    <ReactFlowProvider>
      <SkillTreeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
