import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import type { SkillNodeDto } from "@/components/skill-tree/skill-tree-view";

export const SKILL_TREE_NODE_WIDTH = 260;
export const SKILL_TREE_NODE_HEIGHT = 156;

/** Horizontal gap between avatar and idle subgraphs when both are present. */
export const SKILL_TREE_DOMAIN_GAP = 120;

export type SkillFlowNodeData = {
  dto: SkillNodeDto;
};

/**
 * Lays out a single connected cluster (one domain) with dagre.
 */
function layoutSkillCluster(nodes: SkillNodeDto[]): {
  nodes: Node<SkillFlowNodeData>[];
  edges: Edge[];
} {
  const byKey = new Map(nodes.map((n) => [n.skillKey, n]));
  const edges: Edge[] = [];
  for (const n of nodes) {
    const p = n.prerequisiteSkillKey;
    if (p && byKey.has(p)) {
      edges.push({
        id: `e-${p}__${n.skillKey}`,
        source: p,
        target: n.skillKey,
        type: "skillGradient",
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

function clusterMaxX(rfNodes: Node<SkillFlowNodeData>[]): number {
  if (rfNodes.length === 0) return 0;
  return Math.max(...rfNodes.map((n) => n.position.x + SKILL_TREE_NODE_WIDTH));
}

function clusterMinX(rfNodes: Node<SkillFlowNodeData>[]): number {
  if (rfNodes.length === 0) return 0;
  return Math.min(...rfNodes.map((n) => n.position.x));
}

/**
 * Builds React Flow nodes/edges from API DTOs and runs dagre layout (top-down).
 * Edges follow prerequisiteSkillKey → skill (including cross-branch links).
 * When both avatar and offline domains are present, lays out as two horizontal bands.
 */
export function buildSkillTreeFlowLayout(
  nodes: SkillNodeDto[],
): { nodes: Node<SkillFlowNodeData>[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const avatarNodes = nodes.filter((n) => n.domain !== "offline");
  const offlineNodes = nodes.filter((n) => n.domain === "offline");
  const hasMixed =
    avatarNodes.length > 0 && offlineNodes.length > 0 && new Set(nodes.map((n) => n.domain)).size > 1;

  if (!hasMixed) {
    return layoutSkillCluster(nodes);
  }

  const left = layoutSkillCluster(avatarNodes);
  const right = layoutSkillCluster(offlineNodes);

  if (left.nodes.length === 0) {
    return right;
  }
  if (right.nodes.length === 0) {
    return left;
  }

  const leftMax = clusterMaxX(left.nodes);
  const rightMin = clusterMinX(right.nodes);
  const shiftX = leftMax + SKILL_TREE_DOMAIN_GAP - rightMin;

  const shiftedRight: Node<SkillFlowNodeData>[] = right.nodes.map((n) => ({
    ...n,
    position: { x: n.position.x + shiftX, y: n.position.y },
  }));

  return {
    nodes: [...left.nodes, ...shiftedRight],
    edges: [...left.edges, ...right.edges],
  };
}
