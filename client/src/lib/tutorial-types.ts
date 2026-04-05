/**
 * Shared tutorial step shape for post-auth tour and login help.
 * Keep in sync with spotlight / glow behavior in tutorial-shell.tsx.
 */
export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  targetId?: string;
  page?: string;
  position?: "top" | "bottom" | "left" | "right";
  glowClass?:
    | "field-glow-tutorial"
    | "field-glow-tutorial-success"
    | "field-glow-success"
    | "field-glow-hint"
    | "field-glow-warning";
}
