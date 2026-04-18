import { SkillTreeMini } from "@/components/skill-tree/skill-tree-mini";
import type { TutorialStep } from "@/lib/tutorial-types";

/**
 * Renders the optional inline widget declared by a tutorial step. Keeps the
 * presentation-only `GuidedTourOverlay` free of feature-specific imports.
 */
export function TutorialInlineWidget({
  widget,
}: {
  widget: TutorialStep["inlineWidget"];
}) {
  if (!widget) return null;
  switch (widget) {
    case "skill-tree-mini-avatar":
      return <SkillTreeMini tree="avatar" />;
    case "skill-tree-mini-offline":
      return <SkillTreeMini tree="offline" />;
    default:
      return null;
  }
}
