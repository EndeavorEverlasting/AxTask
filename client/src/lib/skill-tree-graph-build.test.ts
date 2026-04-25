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
    expect(edges[0].type).toBe("skillGradient");
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
});
