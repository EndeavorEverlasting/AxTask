import { useCallback, useId, useRef, useState } from "react";
import { ChevronsRight, Sparkles } from "lucide-react";
import { wrapTextToLines } from "@/lib/pretext-layout";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_SIDEBAR_WIDTH, useImmersiveShell } from "@/hooks/use-immersive-shell";
import { KBD } from "@/lib/keyboard-shortcuts";

const PRETEXT_FONT = "12px ui-sans-serif, system-ui, sans-serif";

const EDGE_QUIPS = [
  "Pretext pulls the nav back from the void — every glyph measured, every line counted.",
  "Immersive mode: the canvas breathes. Drag this strip to summon the rail again.",
  "Sidebar went full hermit. Pretext still knows where it lives.",
  "Full width for dashboard or calendar. The edge remembers your layout.",
] as const;

function pickQuip(seed: number): string {
  return EDGE_QUIPS[Math.abs(seed) % EDGE_QUIPS.length] ?? EDGE_QUIPS[0];
}

const TAP_THRESHOLD_PX = 6;

export function PretextPeekStrip() {
  const { peekStripWidthPx, setSidebarWidthPx, endResize, beginResize } = useImmersiveShell();
  const [quipIndex] = useState(() => Math.floor(Math.random() * EDGE_QUIPS.length));
  const quip = pickQuip(quipIndex);
  const lines = wrapTextToLines(quip, 208, PRETEXT_FONT);
  const tipId = useId();
  const dragStartX = useRef(0);
  const moved = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      beginResize();
      dragStartX.current = e.clientX;
      moved.current = false;
    },
    [beginResize],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - dragStartX.current;
      if (Math.abs(dx) > TAP_THRESHOLD_PX) moved.current = true;
      setSidebarWidthPx(Math.max(0, dx));
    },
    [setSidebarWidthPx],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      if (!moved.current) {
        setSidebarWidthPx(DEFAULT_SIDEBAR_WIDTH);
      }
      endResize();
    },
    [endResize, setSidebarWidthPx],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-describedby={tipId}
            className={cn(
              "group relative z-20 flex shrink-0 flex-col items-center justify-center gap-1 border-r border-primary/30",
              "bg-gradient-to-b from-primary/15 via-indigo-500/10 to-violet-500/15",
              "shadow-[inset_-2px_0_12px_rgba(59,130,246,0.12)]",
              "cursor-ew-resize select-none touch-none transition-[filter] hover:brightness-105",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
            )}
            style={{ width: peekStripWidthPx }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <Sparkles className="h-4 w-4 text-primary drop-shadow-sm animate-pulse" aria-hidden />
            <span
              className="text-[10px] font-bold tracking-tight text-primary/90"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              Pretext
            </span>
            <ChevronsRight
              className="h-4 w-4 text-primary/70 motion-safe:group-hover:translate-x-0.5 transition-transform"
              aria-hidden
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[240px] border-primary/20 bg-popover/95 p-3 shadow-lg">
          <p className="text-[11px] font-semibold text-primary mb-1.5">Pretext edge</p>
          <div id={tipId} className="space-y-1 text-xs text-muted-foreground leading-snug">
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 border-t border-border pt-2">
            Tap to restore · drag right to widen
          </p>
          <p className="text-[10px] text-primary/90 mt-2 font-medium leading-snug">
            Keyboard: {KBD.sidebar} / {KBD.sidebarMac} toggles the rail. {KBD.hotkeyHelp} opens every shortcut — or say
            &quot;keyboard shortcuts&quot; with voice.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
