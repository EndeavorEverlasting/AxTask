import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { Lock, Unlock, X, Star, Target, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SkillNode {
  id: string;
  title: string;
  description: string;
  unlockCondition: string;
  requiredTasks: number;
  icon: React.ReactNode;
  col: number;
  row: number;
  connections: string[];
}

const SKILL_NODES: SkillNode[] = [
  {
    id: "discipline-1",
    title: "Discipline I",
    description: "The foundation of all productivity. Discipline means showing up consistently, even when motivation is low. Completing your first tasks is the first step.",
    unlockCondition: "Complete 3 tasks",
    requiredTasks: 3,
    icon: <Star className="h-6 w-6" />,
    col: 0,
    row: 0,
    connections: ["planning-1", "focus-1"],
  },
  {
    id: "planning-1",
    title: "Planning I",
    description: "Strategic planning transforms chaotic to-do lists into structured, prioritized workflows. You understand deadlines and importance.",
    unlockCondition: "Complete 10 tasks",
    requiredTasks: 10,
    icon: <Target className="h-6 w-6" />,
    col: 1,
    row: 0,
    connections: ["systems-1"],
  },
  {
    id: "focus-1",
    title: "Focus I",
    description: "Deep focus allows you to work without distraction. You complete tasks efficiently and with higher quality by minimizing context-switching.",
    unlockCondition: "Complete 10 tasks",
    requiredTasks: 10,
    icon: <Clock className="h-6 w-6" />,
    col: 0,
    row: 1,
    connections: ["systems-1"],
  },
  {
    id: "systems-1",
    title: "Systems Thinking I",
    description: "You see the big picture. Systems thinking means designing processes and habits that compound over time, making you increasingly effective.",
    unlockCondition: "Complete 25 tasks",
    requiredTasks: 25,
    icon: <Zap className="h-6 w-6" />,
    col: 1,
    row: 1,
    connections: [],
  },
];

const COL_W = 160;
const ROW_H = 160;
const NODE_SIZE = 100;
const PAD = 40;

function getNodeCenter(node: SkillNode) {
  return {
    x: PAD + node.col * COL_W + NODE_SIZE / 2,
    y: PAD + node.row * ROW_H + NODE_SIZE / 2,
  };
}

function NodeCard({
  node,
  completedCount,
  isUnlocked,
  isSelected,
  onClick,
}: {
  node: SkillNode;
  completedCount: number;
  isUnlocked: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const center = getNodeCenter(node);

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
            ? "fill-blue-500 stroke-blue-300"
            : isUnlocked
            ? "fill-blue-600 stroke-blue-400 hover:fill-blue-500"
            : "fill-gray-300 stroke-gray-400 dark:fill-gray-700 dark:stroke-gray-600"
        }`}
        strokeWidth={isSelected ? 3 : 1.5}
      />
      <foreignObject width={NODE_SIZE} height={NODE_SIZE}>
        <div
          className={`flex flex-col items-center justify-center h-full gap-1 px-1 ${
            isUnlocked ? "text-white" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          <div className={isUnlocked ? "text-white" : "text-gray-400 dark:text-gray-500"}>
            {isUnlocked ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div className="text-center">{node.icon}</div>
          <span className="text-[10px] font-semibold text-center leading-tight">{node.title}</span>
        </div>
      </foreignObject>
    </g>
  );
}

export default function SkillTreePage() {
  const [selectedNode, setSelectedNode] = useState<SkillNode | null>(null);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const completedCount = tasks.filter((t) => t.status === "completed").length;

  const isUnlocked = (node: SkillNode) => completedCount >= node.requiredTasks;

  const svgWidth = PAD * 2 + COL_W * 2;
  const svgHeight = PAD * 2 + ROW_H * 2;

  const nodeMap = Object.fromEntries(SKILL_NODES.map((n) => [n.id, n]));

  const lines: { x1: number; y1: number; x2: number; y2: number; fromUnlocked: boolean }[] = [];
  SKILL_NODES.forEach((node) => {
    const from = getNodeCenter(node);
    node.connections.forEach((targetId) => {
      const target = nodeMap[targetId];
      if (!target) return;
      const to = getNodeCenter(target);
      lines.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, fromUnlocked: isUnlocked(node) });
    });
  });

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
                      ? "stroke-blue-400 dark:stroke-blue-500"
                      : "stroke-gray-300 dark:stroke-gray-600"
                  }
                />
              ))}
              {SKILL_NODES.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  completedCount={completedCount}
                  isUnlocked={isUnlocked(node)}
                  isSelected={selectedNode?.id === node.id}
                  onClick={() => {
                    setSelectedNode(selectedNode?.id === node.id ? null : node);
                  }}
                />
              ))}
            </svg>

            <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400 justify-center">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-blue-600" />
                Unlocked
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-gray-300 dark:bg-gray-700" />
                Locked
              </span>
            </div>
          </div>
        </div>

        <div className="lg:w-72">
          {selectedNode ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 relative">
              <button
                onClick={() => setSelectedNode(null)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                style={{ cursor: "pointer" }}
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`p-2 rounded-lg ${
                    isUnlocked(selectedNode)
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                  }`}
                >
                  {selectedNode.icon}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">{selectedNode.title}</h3>
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

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Unlock Condition
                </div>
                <div className="text-sm text-gray-800 dark:text-gray-200">{selectedNode.unlockCondition}</div>
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>
                      {Math.min(completedCount, selectedNode.requiredTasks)}/{selectedNode.requiredTasks}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (completedCount / selectedNode.requiredTasks) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-5 text-center text-sm text-gray-500 dark:text-gray-400">
              Click a node to see details about that skill and how to unlock it.
            </div>
          )}

          <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Your Progress
            </div>
            {SKILL_NODES.map((node) => (
              <div key={node.id} className="flex items-center gap-2 py-1.5">
                {isUnlocked(node) ? (
                  <Unlock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
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
                  <span className="ml-auto text-xs text-blue-500">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
