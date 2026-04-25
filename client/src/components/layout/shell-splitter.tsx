import { useCallback, useId, useRef } from "react";
import { GripVertical } from "lucide-react";
import { wrapTextToLines } from "@/lib/pretext-layout";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useImmersiveShell } from "@/hooks/use-immersive-shell";

const SPLITTER_HINT =
  "Drag to resize the rail. Past ~40% width, Pretext calls it nav-focus — the sidebar pushes the canvas aside.";

export function ShellSplitter() {
  const { sidebarWidthPx, setSidebarWidthPx, beginResize, endResize, isNavFocus } = useImmersiveShell();
  const hintLines = wrapTextToLines(SPLITTER_HINT, 200, "11px ui-sans-serif, system-ui, sans-serif");
  const labelId = useId();
  const dragRef = useRef({ startX: 0, startW: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startW: sidebarWidthPx };
      beginResize();
    },
    [beginResize, sidebarWidthPx],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const { startX, startW } = dragRef.current;
      setSidebarWidthPx(startW + (e.clientX - startX));
    },
    [setSidebarWidthPx],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      endResize();
    },
    [endResize],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(sidebarWidthPx)}
            aria-labelledby={labelId}
            className={cn(
              "group relative z-20 w-2 shrink-0 cursor-ew-resize select-none touch-none bg-transparent",
              "hover:bg-primary/10 active:bg-primary/20 transition-colors",
              isNavFocus && "bg-primary/5 ring-1 ring-primary/20",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span id={labelId} className="sr-only">
              Resize sidebar
            </span>
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300/35 dark:bg-slate-600/50 group-hover:bg-primary/50" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <GripVertical className="h-4 w-4 text-muted-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[240px] border-primary/20 p-3">
          <p className="text-[11px] font-semibold text-primary mb-1.5">Pretext splitter</p>
          <div className="space-y-1 text-xs text-muted-foreground leading-snug">
            {hintLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
