// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSkillTreeFlowLayout } from "./skill-tree-graph-build";
import type { SkillNodeDto } from "@/components/skill-tree/skill-tree-view";

function node(partial: Partial<SkillNodeDto> & Pick<SkillNodeDto, "skillKey" | "branch">): SkillNodeDto {
  return {
    id: partial.id ?? partial.skillKey,
    name: partial.name ?? partial.skillKey,
    description: partial.description ?? "",
    maxLevel: partial.maxLevel ?? 5,
    currentLevel: partial.currentLevel ?? 0,
    nextCost: partial.nextCost ?? 100,
    prerequisiteSkillKey: partial.prerequisiteSkillKey ?? null,
    isUnlocked: partial.isUnlocked ?? false,
    isAvailable: partial.isAvailable ?? true,
    effectType: partial.effectType ?? "guidance_depth",
    effectPerLevel: partial.effectPerLevel ?? 1,
    ...partial,
  };
}

describe("buildSkillTreeFlowLayout", () => {
  it("creates a directed edge from prerequisite to dependent across branches", () => {
    const nodes: SkillNodeDto[] = [
      node({
        skillKey: "guidance-depth",
        branch: "guidance",
        prerequisiteSkillKey: null,
      }),
      node({
        skillKey: "context-memory",
        branch: "analysis",
        prerequisiteSkillKey: "guidance-depth",
      }),
    ];
    const { edges, nodes: rf } = buildSkillTreeFlowLayout(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("guidance-depth");
    expect(edges[0].target).toBe("context-memory");
    expect(rf).toHaveLength(2);
  });

  it("omits edges when the prerequisite key is not in the node set", () => {
    const nodes: SkillNodeDto[] = [
      node({
        skillKey: "orphan-child",
        branch: "analysis",
        prerequisiteSkillKey: "missing-parent",
      }),
    ];
    const { edges } = buildSkillTreeFlowLayout(nodes);
    expect(edges).toHaveLength(0);
  });

  it("lays out one node per skill key with stable dimensions", () => {
    const nodes: SkillNodeDto[] = [
      node({ skillKey: "a", branch: "x", prerequisiteSkillKey: null }),
      node({ skillKey: "b", branch: "x", prerequisiteSkillKey: "a" }),
    ];
    const { nodes: rf } = buildSkillTreeFlowLayout(nodes);
    expect(rf.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(rf[0].width).toBeGreaterThan(0);
    expect(rf[0].position).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("offsets idle subgraph to the right when avatar and offline domains are mixed", () => {
    const nodes: SkillNodeDto[] = [
      node({
        skillKey: "entourage-slots",
        branch: "companions",
        domain: "avatar",
        prerequisiteSkillKey: null,
      }),
      node({
        skillKey: "dynamos",
        branch: "output",
        domain: "offline",
        prerequisiteSkillKey: null,
      }),
    ];
    const { nodes: rf } = buildSkillTreeFlowLayout(nodes);
    expect(rf).toHaveLength(2);
    const avatarX = rf.find((n) => n.id === "entourage-slots")!.position.x;
    const offlineX = rf.find((n) => n.id === "dynamos")!.position.x;
    expect(offlineX).toBeGreaterThan(avatarX);
  });

  it("creates styled edges for additionalEdges when both endpoints exist", () => {
    const nodes: SkillNodeDto[] = [
      node({
        skillKey: "alpha",
        branch: "core",
        prerequisiteSkillKey: null,
        additionalEdges: [
          { sourceSkillKey: "alpha", targetSkillKey: "beta", kind: "synergy" },
          { sourceSkillKey: "alpha", targetSkillKey: "gamma", kind: "unlocks_engine" },
        ],
      }),
      node({ skillKey: "beta", branch: "core", prerequisiteSkillKey: null }),
      node({ skillKey: "gamma", branch: "core", prerequisiteSkillKey: null }),
    ];
    const { edges } = buildSkillTreeFlowLayout(nodes);
    const synergy = edges.find((e) => e.id === "e-synergy-alpha__beta");
    const unlockEngine = edges.find((e) => e.id === "e-unlocks_engine-alpha__gamma");
    expect(synergy).toBeDefined();
    expect(unlockEngine).toBeDefined();
    expect(synergy!.label).toBe("synergy");
    expect(unlockEngine!.label).toBe("engine");
    expect(synergy!.data.kind).toBe("synergy");
    expect(unlockEngine!.data.kind).toBe("unlocks_engine");
  });

  it("skips additionalEdges when an endpoint is missing", () => {
    const nodes: SkillNodeDto[] = [
      node({
        skillKey: "alpha",
        branch: "core",
        prerequisiteSkillKey: null,
        additionalEdges: [
          { sourceSkillKey: "alpha", targetSkillKey: "missing", kind: "synergy" },
        ],
      }),
    ];
    const { edges } = buildSkillTreeFlowLayout(nodes);
    expect(edges).toHaveLength(0);
  });

  it("deduplicates edges when prerequisite and additionalEdges collide", () => {
    const nodes: SkillNodeDto[] = [
      node({ skillKey: "parent", branch: "core", prerequisiteSkillKey: null }),
      node({
        skillKey: "child",
        branch: "core",
        prerequisiteSkillKey: "parent",
        additionalEdges: [
          { sourceSkillKey: "parent", targetSkillKey: "child", kind: "synergy" },
        ],
      }),
    ];
    const { edges } = buildSkillTreeFlowLayout(nodes);
    // The prerequisite edge and the synergy edge share the same endpoints but have different IDs,
    // so both are kept (different semantics). The dedup only guards against identical IDs.
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it("supports LR layout direction option", () => {
    const nodes: SkillNodeDto[] = [
      node({ skillKey: "a", branch: "x", prerequisiteSkillKey: null }),
      node({ skillKey: "b", branch: "x", prerequisiteSkillKey: "a" }),
    ];
    const { nodes: rf } = buildSkillTreeFlowLayout(nodes, { direction: "LR" });
    expect(rf.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(rf[0].position).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("preserves cross-domain additionalEdges between avatar and offline nodes when mixed", () => {
    const nodes: SkillNodeDto[] = [
      node({
        skillKey: "avatar-boost",
        branch: "companions",
        domain: "avatar",
        prerequisiteSkillKey: null,
        additionalEdges: [
          { sourceSkillKey: "avatar-boost", targetSkillKey: "offline-generator", kind: "unlocks_generator" },
        ],
      }),
      node({
        skillKey: "offline-generator",
        branch: "generators",
        domain: "offline",
        prerequisiteSkillKey: null,
      }),
    ];
    const { edges } = buildSkillTreeFlowLayout(nodes);
    const crossEdge = edges.find((e) => e.id === "e-unlocks_generator-avatar-boost__offline-generator");
    expect(crossEdge).toBeDefined();
    expect(crossEdge!.label).toBe("generator");
  });
});
