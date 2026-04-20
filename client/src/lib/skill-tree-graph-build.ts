import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import type { SkillNodeDto } from "@/components/skill-tree/skill-tree-view";

export const SKILL_TREE_NODE_WIDTH = 260;
export const SKILL_TREE_NODE_HEIGHT = 156;

export type SkillFlowNodeData = {
  dto: SkillNodeDto;
};

/**
 * Builds React Flow nodes/edges from API DTOs and runs dagre layout (top-down).
 * Edges follow prerequisiteSkillKey → skill (including cross-branch links).
 */
export function buildSkillTreeFlowLayout(
  nodes: SkillNodeDto[],
): { nodes: Node<SkillFlowNodeData>[]; edges: Edge[] } {
  const byKey = new Map(nodes.map((n) => [n.skillKey, n]));
  const edges: Edge[] = [];
  for (const n of nodes) {
    const p = n.prerequisiteSkillKey;
    if (p && byKey.has(p)) {
      edges.push({
        id: `e-${p}__${n.skillKey}`,
        source: p,
        target: n.skillKey,
        type: "smoothstep",
        style: { stroke: "hsl(var(--border))", strokeWidth: 1.5 },
      });
    }
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 56,
    ranksep: 96,
    marginx: 28,
    marginy: 28,
  });

  for (const n of nodes) {
    g.setNode(n.skillKey, {
      width: SKILL_TREE_NODE_WIDTH,
      height: SKILL_TREE_NODE_HEIGHT,
    });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const w = SKILL_TREE_NODE_WIDTH;
  const h = SKILL_TREE_NODE_HEIGHT;
  const rfNodes: Node<SkillFlowNodeData>[] = nodes.map((n) => {
    const laid = g.node(n.skillKey);
    return {
      id: n.skillKey,
      type: "skillNode",
      position: { x: laid.x - w / 2, y: laid.y - h / 2 },
      data: { dto: n },
      width: w,
      height: h,
    };
  });

  return { nodes: rfNodes, edges };
}
