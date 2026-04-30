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
      fitView({ padding: 0.22, duration: reduced ? 0 : 420 });
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
    stateTone = "text-emerald-300 border-emerald-400/60 bg-emerald-500/10";
    StateIcon = Check;
  } else if (dto.isUnlocked) {
    stateLabel = "Active";
    stateTone = "text-amber-200 border-amber-300/60 bg-amber-500/10";
    StateIcon = Zap;
  } else if (locked) {
    stateLabel = "Locked";
    stateTone = "text-muted-foreground border-border/70 bg-background/30";
    StateIcon = Lock;
  } else {
    stateLabel = "Available";
    stateTone = "text-sky-200 border-sky-300/60 bg-sky-500/10";
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
        "group relative w-[280px] overflow-hidden rounded-2xl border bg-background/88 p-3 shadow-lg backdrop-blur-md transition-all duration-300",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_34%)] before:opacity-75",
        "after:pointer-events-none after:absolute after:inset-px after:rounded-[calc(1rem-1px)] after:border after:border-white/10",
        locked && "opacity-70 grayscale-[0.2]",
        !locked && "hover:-translate-y-0.5 hover:shadow-2xl",
        treeKind === "offline" && "border-cyan-300/45 shadow-cyan-950/40 hover:shadow-cyan-500/25",
        treeKind === "avatar" && "border-violet-300/45 shadow-violet-950/35 hover:shadow-violet-500/25",
      )}
      data-testid={`skill-node-${treeKind}-${dto.skillKey}`}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-80",
          treeKind === "offline" ? "bg-cyan-400/20" : "bg-violet-400/20",
        )}
      />
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border !border-background !bg-primary" />
      <div className="relative flex items-start gap-2.5">
        <AvatarOrb
          variant={avatarKey}
          size="sm"
          wobble={!locked}
          label={avatarName}
          className="mt-0.5 shrink-0 ring-2 ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="max-w-[11rem] truncate text-sm font-semibold leading-tight text-foreground">
              {dto.name}
            </h4>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                stateTone,
              )}
            >
              <StateIcon className="h-2.5 w-2.5" aria-hidden />
              {stateLabel}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {dto.description}
          </p>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground">
            {formatSkillEffect(dto.effectType, dto.effectPerLevel)}
          </p>
          {dto.prerequisiteSkillKey && !dto.isUnlocked && !dto.isAvailable && (
            <p className="mt-1 truncate text-[9px] italic text-muted-foreground/80">
              Requires: {dto.prerequisiteSkillKey}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div
            className="rounded-lg border border-white/10 bg-background/50 px-2 py-1 text-xs font-bold tabular-nums shadow-inner"
            aria-label={`Level ${dto.currentLevel} of ${dto.maxLevel}`}
          >
            {dto.currentLevel}
            <span className="text-muted-foreground">/{dto.maxLevel}</span>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            {dto.nextCost != null ? (
              <>
                <Coins className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
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
            className="h-7 px-2 text-[10px] shadow-sm"
            data-testid={`skill-unlock-${treeKind}-${dto.skillKey}`}
          >
            {atMax ? "Maxed" : locked ? "Locked" : dto.isUnlocked ? "Upgrade" : "Unlock"}
          </Button>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border !border-background !bg-primary" />
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
  const unlockedCount = nodes.filter((n) => n.isUnlocked).length;
  const availableCount = nodes.filter((n) => n.isAvailable && !n.isUnlocked).length;

  return (
    <SkillTreeGraphActionsContext.Provider value={actions}>
      <div
        className={cn(
          "skill-tree-flow relative min-h-[520px] h-[min(78vh,760px)] w-full overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/95 shadow-2xl shadow-cyan-950/30",
          "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_18%_12%,rgba(168,85,247,0.20),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.18),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.55),rgba(2,6,23,0.95))]",
          className,
        )}
        data-testid={`skill-tree-graph-${tree}`}
      >
        <style>{`
          .skill-tree-flow .react-flow__edge-path {
            transition: stroke-width 180ms ease, opacity 180ms ease, filter 180ms ease;
          }
          .skill-tree-flow .skill-tree-glow-edge .react-flow__edge-path {
            stroke-dasharray: 10 16;
            animation: skill-tree-energy-flow 1.9s linear infinite;
          }
          .skill-tree-flow .react-flow__edge:hover .react-flow__edge-path {
            stroke-width: 4;
            opacity: 1;
            filter: drop-shadow(0 0 12px currentColor);
          }
          .skill-tree-flow .react-flow__controls,
          .skill-tree-flow .react-flow__minimap {
            box-shadow: 0 18px 45px rgba(8, 47, 73, 0.30);
          }
          @keyframes skill-tree-energy-flow {
            from { stroke-dashoffset: 0; }
            to { stroke-dashoffset: -52; }
          }
          @media (prefers-reduced-motion: reduce) {
            .skill-tree-flow .skill-tree-glow-edge .react-flow__edge-path {
              animation: none;
              stroke-dasharray: none;
            }
          }
        `}</style>
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
          minZoom={0.28}
          maxZoom={1.5}
        >
          <Panel position="top-center" className="m-3 rounded-2xl border border-cyan-300/20 bg-slate-950/80 px-4 py-2 text-xs text-slate-200 shadow-xl shadow-cyan-950/30 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="font-semibold uppercase tracking-[0.24em] text-cyan-200">Skill Tree HUD</span>
              <span className="text-slate-400">{nodes.length} nodes</span>
              <span className="text-amber-200">{unlockedCount} active</span>
              <span className="text-sky-200">{availableCount} available</span>
            </div>
          </Panel>
          {showRegions ? (
            <>
              <Panel position="top-left" className="m-3 max-w-[min(100%,16rem)] rounded-xl border border-violet-300/30 bg-slate-950/75 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-violet-100 shadow-lg shadow-violet-950/30 backdrop-blur-md">
                Companions &amp; productivity
              </Panel>
              <Panel position="top-right" className="m-3 max-w-[min(100%,16rem)] rounded-xl border border-cyan-300/30 bg-slate-950/75 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-100 shadow-lg shadow-cyan-950/30 backdrop-blur-md">
                Idle generator
              </Panel>
            </>
          ) : null}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.25} color="rgba(148, 163, 184, 0.32)" />
          <Controls showInteractive={false} className="!border !border-cyan-300/20 !bg-slate-950/80 !text-slate-100" />
          <MiniMap
            className="!rounded-xl !border !border-cyan-300/20 !bg-slate-950/85"
            maskColor="rgba(2, 6, 23, 0.58)"
            nodeColor={(node) => {
              const domain = (node.data as SkillFlowNodeData | undefined)?.dto.domain;
              return domain === "offline" ? "rgb(34 211 238)" : "rgb(167 139 250)";
            }}
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
