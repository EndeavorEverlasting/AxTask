import { Keyboard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { pretextGradientCtaClassName } from "@/components/pretext/pretext-confirmation-shell";
import { KBD } from "@/lib/keyboard-shortcuts";
import { cn } from "@/lib/utils";

function openHotkeyHelp() {
  window.dispatchEvent(new Event("axtask-open-hotkey-help"));
}

export type PretextShortcutsBeaconLayout = "fab" | "sheetStrip" | "inlineCta";

const tooltipLines = [
  `Sidebar: ${KBD.sidebar} / ${KBD.sidebarMac}`,
  `Shortcut list: ${KBD.hotkeyHelp} / ${KBD.hotkeyHelpMac}`,
  'Voice (mobile-friendly): say "keyboard shortcuts", "toggle sidebar", "open calendar", or "global search".',
] as const;

export function PretextShortcutsBeacon({
  layout = "fab",
  className,
}: {
  layout?: PretextShortcutsBeaconLayout;
  className?: string;
}) {
  const isFab = layout === "fab";

  const button = (
    <Button
      type="button"
      variant="ghost"
      size={layout === "inlineCta" ? "default" : "icon"}
      onClick={openHotkeyHelp}
      aria-label="Open keyboard shortcuts"
      className={cn(
        "relative overflow-hidden border-2 border-primary/40 shadow-md shadow-primary/15",
        "motion-safe:animate-pulse motion-reduce:animate-none",
        "hover:brightness-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        pretextGradientCtaClassName,
        layout === "fab" &&
          "hidden md:inline-flex h-12 w-12 shrink-0 rounded-full p-0 shadow-lg shadow-cyan-500/20 ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
        layout === "sheetStrip" &&
          "w-full justify-center gap-2 rounded-none border-x-0 border-t-0 py-3 text-sm font-semibold",
        layout === "inlineCta" && "w-full justify-center gap-2 py-6 text-base font-semibold rounded-xl",
        className,
      )}
    >
      <span className="relative z-10 flex items-center gap-2">
        <Keyboard className={cn("shrink-0", layout === "fab" ? "h-5 w-5" : "h-5 w-5")} aria-hidden />
        {!isFab ? (
          <>
            <Sparkles className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span>Shortcuts & voice hints</span>
          </>
        ) : null}
      </span>
      {isFab ? (
        <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/25 to-transparent" />
      ) : null}
    </Button>
  );

  const wrapped = (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={isFab ? "left" : "bottom"} className="max-w-[280px] border-primary/20 text-left text-xs">
        <p className="font-semibold text-primary mb-1.5">Pretext hints</p>
        <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
          {tooltipLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );

  if (isFab) {
    return (
      <div
        className={cn(
          "pointer-events-auto hidden md:block fixed top-[4.5rem] right-4 z-40",
          className,
        )}
      >
        {wrapped}
      </div>
    );
  }

  return <div className={cn("w-full", className)}>{wrapped}</div>;
}
