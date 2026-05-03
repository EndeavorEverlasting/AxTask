import { Sparkles } from "lucide-react";
import { wrapTextToLines } from "@/lib/pretext-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useImmersiveShell } from "@/hooks/use-immersive-shell";
import { KBD } from "@/lib/keyboard-shortcuts";

const FONT = "13px ui-sans-serif, system-ui, sans-serif";

function immersiveCueText(): string {
  return `Pretext immersive mode — the canvas owns the fold. Drag the left edge strip to summon the nav again, or use ${KBD.sidebar} (${KBD.sidebarMac}) to toggle the sidebar. Say "toggle sidebar" with voice on mobile.`;
}

/** Shown on dashboard / calendar when the sidebar is hidden for a full-width module view. */
export function ImmersivePretextCue() {
  const isMobile = useIsMobile();
  const { isImmersive } = useImmersiveShell();
  if (!isImmersive || isMobile) return null;
  const lines = wrapTextToLines(immersiveCueText(), 560, FONT);

  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-primary/25 bg-gradient-to-r from-primary/8 to-violet-500/10 px-3 py-2.5 text-sm text-primary/95 shadow-sm"
      role="status"
    >
      <Sparkles className="h-4 w-4 shrink-0 mt-0.5 motion-safe:animate-pulse" aria-hidden />
      <div className="space-y-0.5 min-w-0">
        {lines.map((line, i) => (
          <p key={i} className="leading-snug">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
