import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Task, type SkillUnlock } from "@shared/schema";
import { SKILL_NODE_DATA, type SkillNodeData } from "@shared/skill-nodes";
import { SKILL_BENEFITS } from "@/lib/skill-benefits";
import { Lock, Unlock, X, Star, Target, Clock, Zap, Flame, BarChart2, Eye, Cpu, CheckCircle, Coins, TrendingUp, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

const ICON_MAP: Record<string, React.ReactNode> = {
  Star: <Star className="h-6 w-6" />,
  Target: <Target className="h-6 w-6" />,
  Clock: <Clock className="h-6 w-6" />,
  Zap: <Zap className="h-6 w-6" />,
  Flame: <Flame className="h-6 w-6" />,
  BarChart2: <BarChart2 className="h-6 w-6" />,
  Eye: <Eye className="h-6 w-6" />,
  Cpu: <Cpu className="h-6 w-6" />,
};

const BENEFIT_TYPE_ICON: Record<string, React.ReactNode> = {
  coin_multiplier: <Coins className="h-3.5 w-3.5" />,
  cap_raise: <TrendingUp className="h-3.5 w-3.5" />,
  feature_unlock: <Zap className="h-3.5 w-3.5" />,
  passive_bonus: <Award className="h-3.5 w-3.5" />,
};

const COL_W = 160;
const ROW_H = 160;
const NODE_SIZE = 100;
const PAD = 40;

const TIER_COLORS = {
  1: {
    unlocked: "fill-blue-600 stroke-blue-400 hover:fill-blue-500",
    selected: "fill-blue-500 stroke-blue-300",
    icon: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    progress: "bg-blue-500",
    line: "stroke-blue-400 dark:stroke-blue-500",
    badge: "Tier I",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  2: {
    unlocked: "fill-violet-600 stroke-violet-400 hover:fill-violet-500",
    selected: "fill-violet-500 stroke-violet-300",
    icon: "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400",
    progress: "bg-violet-500",
    line: "stroke-violet-400 dark:stroke-violet-500",
    badge: "Tier II",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  },
};

function getNodeCenter(node: SkillNodeData) {
  return {
    x: PAD + node.col * COL_W + NODE_SIZE / 2,
    y: PAD + node.row * ROW_H + NODE_SIZE / 2,
  };
}

function NodeCard({
  node,
  isUnlocked,
  isSelected,
  onClick,
}: {
  node: SkillNodeData;
  isUnlocked: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const center = getNodeCenter(node);
  const colors = TIER_COLORS[node.tier];

  return (
    <g
      transform={`translate(${center.x - NODE_SIZE / 2}, ${center.y - NODE_SIZE / 2})`}
      onClick={onClick}
      className={isUnlocked ? "skill-node" : "skill-node-locked"}
      style={{ cursor: isUnlocked ? "pointer" : "not-allowed" }}
    >
      <rect
        width={NODE_SIZE}
        height={NODE_SIZE}
        rx={12}
        className={`transition-all duration-200 ${
          isSelected
            ? colors.selected
            : isUnlocked
            ? colors.unlocked
            : "fill-gray-300 stroke-gray-400 dark:fill-gray-700 dark:stroke-gray-600"
        }`}
        strokeWidth={isSelected ? 3 : 1.5}
      />
      <rect x={NODE_SIZE - 32} y={0} width={32} height={18} rx={6} className={isUnlocked ? (node.tier === 2 ? "fill-violet-400" : "fill-blue-400") : "fill-gray-400 dark:fill-gray-600"} />
      <text
        x={NODE_SIZE - 16}
        y={13}
        textAnchor="middle"
        fontSize={9}
        fontWeight="bold"
        fill="white"
      >
        T{node.tier}
      </text>
      <foreignObject width={NODE_SIZE} height={NODE_SIZE}>
        <div
          className={`flex flex-col items-center justify-center h-full gap-1 px-1 ${
            isUnlocked ? "text-white" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          <div className={isUnlocked ? "text-white" : "text-gray-400 dark:text-gray-500"}>
            {isUnlocked ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div className="text-center">{ICON_MAP[node.iconName]}</div>
          <span className="text-[10px] font-semibold text-center leading-tight">{node.title}</span>
        </div>
      </foreignObject>
    </g>
  );
}

export default function SkillTreePage() {
  const [selectedNode, setSelectedNode] = useState<SkillNodeData | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: skillUnlockRecords = [], isLoading: unlockLoading } = useQuery<SkillUnlock[]>({
    queryKey: ["/api/skill-unlocks"],
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === "completed").length,
    [tasks]
  );

  const serverUnlockedIds = useMemo(
    () => new Set(skillUnlockRecords.map((u) => u.nodeId)),
    [skillUnlockRecords]
  );

  const inFlightRef = useRef<Set<string>>(new Set());
  const succeededRef = useRef<Set<string>>(new Set());

  const unlockMutation = useMutation({
    mutationFn: (nodeId: string) =>
      apiRequest("POST", "/api/skill-unlocks", { nodeId }),
    onSuccess: async (res, nodeId) => {
      const data = await res.json();
      succeededRef.current.add(nodeId);
      inFlightRef.current.delete(nodeId);
      if (data.isNew) {
        const node = SKILL_NODE_DATA.find((n) => n.id === data.unlock.nodeId);
        const benefit = node ? SKILL_BENEFITS[node.id] : null;
        toast({
          title: "🎉 Skill Unlocked!",
          description: node
            ? `You've unlocked "${node.title}"${benefit ? ` — ${benefit.label}` : ""}. Keep completing tasks to progress further!`
            : "A new skill has been unlocked.",
          duration: 6000,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/skill-unlocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/active-bonuses"] });
    },
    onError: (_err, nodeId) => {
      inFlightRef.current.delete(nodeId);
    },
  });

  useEffect(() => {
    if (unlockLoading) return;

    SKILL_NODE_DATA.forEach((node) => {
      if (
        completedCount >= node.requiredTasks &&
        !serverUnlockedIds.has(node.id) &&
        !succeededRef.current.has(node.id) &&
        !inFlightRef.current.has(node.id)
      ) {
        inFlightRef.current.add(node.id);
        unlockMutation.mutate(node.id);
      }
    });
  }, [unlockLoading, completedCount, serverUnlockedIds]);

  const isUnlocked = (node: SkillNodeData) => serverUnlockedIds.has(node.id);

  const maxRow = Math.max(...SKILL_NODE_DATA.map((n) => n.row));
  const maxCol = Math.max(...SKILL_NODE_DATA.map((n) => n.col));
  const svgWidth = PAD * 2 + COL_W * (maxCol + 1);
  const svgHeight = PAD * 2 + ROW_H * (maxRow + 1);

  const nodeMap = Object.fromEntries(SKILL_NODE_DATA.map((n) => [n.id, n]));

  const lines: {
    x1: number; y1: number; x2: number; y2: number;
    fromUnlocked: boolean; tier: 1 | 2;
  }[] = [];
  SKILL_NODE_DATA.forEach((node) => {
    const from = getNodeCenter(node);
    node.connections.forEach((targetId) => {
      const target = nodeMap[targetId];
      if (!target) return;
      const to = getNodeCenter(target);
      lines.push({
        x1: from.x, y1: from.y, x2: to.x, y2: to.y,
        fromUnlocked: isUnlocked(node),
        tier: node.tier,
      });
    });
  });

  const selectedColors = selectedNode ? TIER_COLORS[selectedNode.tier] : null;
  const selectedBenefit = selectedNode ? SKILL_BENEFITS[selectedNode.id] : null;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Skill Tree</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
          Unlock skills by completing tasks — {completedCount} task{completedCount !== 1 ? "s" : ""} completed so far
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 flex justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 inline-block">
            <svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="overflow-visible"
            >
              {lines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  strokeWidth={2}
                  strokeDasharray={l.fromUnlocked ? undefined : "6 4"}
                  className={
                    l.fromUnlocked
                      ? TIER_COLORS[l.tier].line
                      : "stroke-gray-300 dark:stroke-gray-600"
                  }
                />
              ))}
              {SKILL_NODE_DATA.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isUnlocked={isUnlocked(node)}
                  isSelected={selectedNode?.id === node.id}
                  onClick={() => {
                    setSelectedNode(selectedNode?.id === node.id ? null : node);
                  }}
                />
              ))}
            </svg>

            <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400 justify-center flex-wrap">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-blue-600" />
                Tier I — Unlocked
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-violet-600" />
                Tier II — Unlocked
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-gray-300 dark:bg-gray-700" />
                Locked
              </span>
            </div>
          </div>
        </div>

        <div className="lg:w-72 space-y-4">
          {selectedNode && selectedColors ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 relative">
              <button
                onClick={() => setSelectedNode(null)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                style={{ cursor: "pointer" }}
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${isUnlocked(selectedNode) ? selectedColors.icon : "bg-gray-100 dark:bg-gray-700 text-gray-400"}`}>
                  {ICON_MAP[selectedNode.iconName]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">{selectedNode.title}</h3>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selectedColors.badgeClass}`}>
                      {selectedColors.badge}
                    </span>
                  </div>
                  <Badge
                    variant={isUnlocked(selectedNode) ? "default" : "secondary"}
                    className="text-xs mt-0.5"
                  >
                    {isUnlocked(selectedNode) ? (
                      <><Unlock className="h-3 w-3 mr-1" />Unlocked</>
                    ) : (
                      <><Lock className="h-3 w-3 mr-1" />Locked</>
                    )}
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                {selectedNode.description}
              </p>

              {selectedBenefit && (
                <div className={`rounded-lg p-3 mb-4 border ${
                  isUnlocked(selectedNode)
                    ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40"
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {BENEFIT_TYPE_ICON[selectedBenefit.type]}
                      Benefit
                    </div>
                    {isUnlocked(selectedNode) ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                        <CheckCircle className="h-3 w-3" />Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">
                        <Lock className="h-3 w-3" />Unlock to activate
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-0.5">
                    {selectedBenefit.label}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    {selectedBenefit.description}
                  </p>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Unlock Condition
                </div>
                <div className="text-sm text-gray-800 dark:text-gray-200">{selectedNode.unlockCondition}</div>
                {!isUnlocked(selectedNode) && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>
                        {Math.min(completedCount, selectedNode.requiredTasks)}/{selectedNode.requiredTasks}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${selectedColors.progress}`}
                        style={{
                          width: `${Math.min(100, (completedCount / selectedNode.requiredTasks) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {isUnlocked(selectedNode) && (() => {
                  const record = skillUnlockRecords.find((u) => u.nodeId === selectedNode.id);
                  if (!record?.unlockedAt) return null;
                  return (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Unlocked {new Date(record.unlockedAt).toLocaleDateString()}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-5 text-center text-sm text-gray-500 dark:text-gray-400">
              Click a node to see details about that skill and how to unlock it.
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Your Progress
            </div>
            {[1, 2].map((tier) => (
              <div key={tier} className="mb-3">
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${tier === 1 ? "text-blue-500" : "text-violet-500"}`}>
                  Tier {tier}
                </div>
                {SKILL_NODE_DATA.filter((n) => n.tier === tier).map((node) => (
                  <div key={node.id} className="flex items-center gap-2 py-1">
                    {isUnlocked(node) ? (
                      <Unlock className={`h-3.5 w-3.5 shrink-0 ${node.tier === 2 ? "text-violet-500" : "text-blue-500"}`} />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        isUnlocked(node)
                          ? "text-gray-900 dark:text-gray-100 font-medium"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {node.title}
                    </span>
                    {isUnlocked(node) && (
                      <span className={`ml-auto text-xs ${node.tier === 2 ? "text-violet-500" : "text-blue-500"}`}>✓</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
