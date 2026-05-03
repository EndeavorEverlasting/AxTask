import { SkillTreeView, type SkillTreeKind } from "./skill-tree-view";

interface SkillTreeMiniProps {
  tree?: SkillTreeKind;
}

/**
 * Compact, read-only skill tree preview rendered inside the interactive
 * tutorial bubble. Uses the same data source as the full /skill-tree page.
 */
export function SkillTreeMini({ tree = "avatar" }: SkillTreeMiniProps) {
  return (
    <div
      className="max-h-[220px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-2"
      data-testid={`skill-tree-mini-${tree}`}
    >
      <SkillTreeView tree={tree} readOnly compact />
    </div>
  );
}
