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

/** Meaning of a directed edge between two skill nodes. */
export type SkillEdgeKind =
  | "prerequisite"
  | "synergy"
  | "continuum"
  | "unlocks_generator"
  | "unlocks_engine"
  | "unlocks_ui_surface";

/** Optional cross-link metadata carried by a skill node DTO. */
export type SkillGraphEdgeDto = {
  sourceSkillKey: string;
  targetSkillKey: string;
  kind: SkillEdgeKind;
};

/** Future-friendly layout direction. Defaults to top-down (TB). */
export type SkillTreeLayoutDirection = "TB" | "LR";

export type BuildSkillTreeOptions = {
  direction?: SkillTreeLayoutDirection;
};

function edgeFromKind(
  id: string,
  source: string,
  target: string,
  kind: SkillEdgeKind,
): Edge {
  const base: Edge = {
    id,
    source,
    target,
    type: "smoothstep",
    data: { kind },
  };
  switch (kind) {
    case "prerequisite":
      return {
        ...base,
        style: { stroke: "hsl(var(--border))", strokeWidth: 1.5 },
      };
    case "synergy":
      return {
        ...base,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeDasharray: "4 4" },
        label: "synergy",
        labelStyle: { fontSize: 10, fill: "hsl(var(--primary))" },
        labelShowBg: true,
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.85 },
      };
    case "continuum":
      return {
        ...base,
        style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5, strokeDasharray: "2 2" },
        label: "continuum",
        labelStyle: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
        labelShowBg: true,
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.85 },
      };
    case "unlocks_generator":
      return {
        ...base,
        style: { stroke: "#06b6d4", strokeWidth: 2 },
        label: "generator",
        labelStyle: { fontSize: 10, fill: "#06b6d4" },
        labelShowBg: true,
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.85 },
      };
    case "unlocks_engine":
      return {
        ...base,
        style: { stroke: "#8b5cf6", strokeWidth: 2 },
        label: "engine",
        labelStyle: { fontSize: 10, fill: "#8b5cf6" },
        labelShowBg: true,
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.85 },
      };
    case "unlocks_ui_surface":
      return {
        ...base,
        style: { stroke: "#f59e0b", strokeWidth: 2 },
        label: "UI",
        labelStyle: { fontSize: 10, fill: "#f59e0b" },
        labelShowBg: true,
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.85 },
      };
    default:
      return base;
  }
}

/**
 * Lays out a single connected cluster (one domain) with dagre.
 */
function layoutSkillCluster(
  nodes: SkillNodeDto[],
  direction: SkillTreeLayoutDirection = "TB",
): {
  nodes: Node<SkillFlowNodeData>[];
  edges: Edge[];
} {
  const byKey = new Map(nodes.map((n) => [n.skillKey, n]));
  const edgeIds = new Set<string>();
  const edges: Edge[] = [];

  for (const n of nodes) {
    const p = n.prerequisiteSkillKey;
    if (p && byKey.has(p)) {
      const id = `e-prereq-${p}__${n.skillKey}`;
      if (!edgeIds.has(id)) {
        edgeIds.add(id);
        edges.push(edgeFromKind(id, p, n.skillKey, "prerequisite"));
      }
    }
    if (n.additionalEdges) {
      for (const ae of n.additionalEdges) {
        if (byKey.has(ae.sourceSkillKey) && byKey.has(ae.targetSkillKey)) {
          const id = `e-${ae.kind}-${ae.sourceSkillKey}__${ae.targetSkillKey}`;
          if (!edgeIds.has(id)) {
            edgeIds.add(id);
            edges.push(edgeFromKind(id, ae.sourceSkillKey, ae.targetSkillKey, ae.kind));
          }
        }
      }
    }
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
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
 * Builds React Flow nodes/edges from API DTOs and runs dagre layout (top-down by default).
 * Edges follow prerequisiteSkillKey → skill (including cross-branch links) and any
 * additionalEdges declared on node DTOs.
 * When both avatar and offline domains are present, lays out as two horizontal bands.
 */
export function buildSkillTreeFlowLayout(
  nodes: SkillNodeDto[],
  options?: BuildSkillTreeOptions,
): { nodes: Node<SkillFlowNodeData>[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const direction = options?.direction ?? "TB";

  const avatarNodes = nodes.filter((n) => n.domain !== "offline");
  const offlineNodes = nodes.filter((n) => n.domain === "offline");
  const hasMixed =
    avatarNodes.length > 0 && offlineNodes.length > 0 && new Set(nodes.map((n) => n.domain)).size > 1;

  if (!hasMixed) {
    return layoutSkillCluster(nodes, direction);
  }

  const left = layoutSkillCluster(avatarNodes, direction);
  const right = layoutSkillCluster(offlineNodes, direction);

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
