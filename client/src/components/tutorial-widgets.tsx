import { SkillTreeMini } from "@/components/skill-tree/skill-tree-mini";
import { Button } from "@/components/ui/button";
import type { TutorialStep } from "@/lib/tutorial-types";
import { KBD } from "@/lib/keyboard-shortcuts";
import { BellRing } from "lucide-react";

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
    case "alarm-tutorial-demo":
      return <AlarmTutorialDemo />;
    default:
      return null;
  }
}

function AlarmTutorialDemo() {
  const openPanel = () => {
    window.dispatchEvent(new Event("axtask-open-alarm-panel"));
  };

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-3 space-y-2">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Hands-on: open the panel from here, or use{" "}
        <span className="font-mono text-foreground">{KBD.alarmPanel}</span> /{" "}
        <span className="font-mono text-foreground">{KBD.alarmPanelMac}</span> with focus in the app.
      </p>
      <Button type="button" size="sm" className="w-full gap-2" onClick={openPanel}>
        <BellRing className="h-4 w-4 shrink-0" aria-hidden />
        Open alarm panel
      </Button>
    </div>
  );
}
