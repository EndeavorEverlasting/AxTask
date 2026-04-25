// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillTreeGraph } from "./skill-tree-graph";
import type { SkillNodeDto } from "./skill-tree-view";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  media: "(prefers-reduced-motion: reduce)",
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

function makeNode(partial: Partial<SkillNodeDto> & Pick<SkillNodeDto, "skillKey" | "branch">): SkillNodeDto {
  return {
    id: partial.id ?? partial.skillKey,
    skillKey: partial.skillKey,
    name: partial.name ?? partial.skillKey,
    description: partial.description ?? "",
    branch: partial.branch,
    maxLevel: partial.maxLevel ?? 5,
    currentLevel: partial.currentLevel ?? 0,
    nextCost: partial.nextCost ?? 100,
    prerequisiteSkillKey: partial.prerequisiteSkillKey ?? null,
    isUnlocked: partial.isUnlocked ?? false,
    isAvailable: partial.isAvailable ?? true,
    effectType: partial.effectType ?? "guidance_depth",
    effectPerLevel: partial.effectPerLevel ?? 1,
    domain: partial.domain ?? "avatar",
  };
}

describe("SkillTreeGraph HUD", () => {
  it("renders pretext zoom labels in custom hud", async () => {
    const nodes: SkillNodeDto[] = [
      makeNode({ skillKey: "n1", branch: "core" }),
      makeNode({ skillKey: "n2", branch: "core", prerequisiteSkillKey: "n1" }),
    ];
    render(
      <SkillTreeGraph
        tree="avatar"
        nodes={nodes}
        walletBalance={1000}
        readOnly={false}
        isPending={false}
        onUnlock={() => {}}
      />,
    );

    expect(await screen.findByText("Pretext zoom in")).toBeInTheDocument();
    expect(screen.getByText("Pretext zoom out")).toBeInTheDocument();
  });
});

