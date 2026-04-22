import { createContext, memo, useContext, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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
        "rounded-lg border bg-background/90 shadow-sm backdrop-blur-sm w-[260px]",
        "p-2.5",
        locked && "opacity-75",
        treeKind === "offline" && "border-cyan-500/35 shadow-cyan-950/20",
        treeKind === "avatar" && "border-violet-500/35 shadow-violet-950/15",
      )}
      data-testid={`skill-node-${treeKind}-${dto.skillKey}`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border" />
      <div className="flex items-start gap-2">
        <AvatarOrb
          variant={avatarKey}
          size="sm"
          wobble={false}
          label={avatarName}
          className="shrink-0 mt-0.5"
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
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border" />
    </div>
  );
}

const SkillTreeFlowNode = memo(SkillTreeFlowNodeImpl);

const nodeTypes = { skillNode: SkillTreeFlowNode } as NodeTypes;

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
          "skill-tree-flow rounded-xl border border-border bg-muted/20 min-h-[420px] h-[min(70vh,640px)] w-full",
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
          fitView={false}
          defaultViewport={defaultViewport}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnScroll
          zoomOnScroll
          minZoom={0.35}
          maxZoom={1.35}
        >
          {showRegions ? (
            <>
              <Panel position="top-left" className="m-2 max-w-[min(100%,14rem)] rounded-lg border border-violet-500/25 bg-background/85 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
                Companions &amp; productivity
              </Panel>
              <Panel position="top-right" className="m-2 max-w-[min(100%,14rem)] rounded-lg border border-cyan-500/25 bg-background/85 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
                Idle generator
              </Panel>
            </>
          ) : null}
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
