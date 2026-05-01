import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Crosshair, Focus, LayoutGrid, ListTree, Maximize2, RotateCcw } from "lucide-react";
import type { GanttScaleMode, GanttTimelineScope } from "./task-gantt-types";

const SCOPES: { value: GanttTimelineScope; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "this-week", label: "This week" },
  { value: "next-21-days", label: "Next 21 days" },
  { value: "certification", label: "Certification" },
  { value: "pmp-sprint", label: "PMP Registration Sprint" },
  { value: "blocked", label: "Blocked tasks" },
  { value: "hard-deadlines", label: "Hard deadlines" },
];

export interface TaskGanttHudProps {
  mode: GanttScaleMode;
  onModeChange: (m: GanttScaleMode) => void;
  scope: GanttTimelineScope;
  onScopeChange: (s: GanttTimelineScope) => void;
  unlocked: boolean;
  showCriticalPath: boolean;
  onToggleCriticalPath: (v: boolean) => void;
  blockedOnly: boolean;
  onToggleBlockedOnly: (v: boolean) => void;
  legendOpen: boolean;
  onToggleLegend: () => void;
  onFitView: () => void;
  onToday: () => void;
  onZoomReset: () => void;
}

export function TaskGanttHud({
  mode,
  onModeChange,
  scope,
  onScopeChange,
  unlocked,
  showCriticalPath,
  onToggleCriticalPath,
  blockedOnly,
  onToggleBlockedOnly,
  legendOpen,
  onToggleLegend,
  onFitView,
  onToday,
  onZoomReset,
}: TaskGanttHudProps) {
  const modeBtn = (m: GanttScaleMode, label: string, icon: ReactNode) => (
    <Button
      type="button"
      size="sm"
      variant={mode === m ? "default" : "outline"}
      className={cn("h-8 px-2 text-[10px]", mode === m && "shadow-sm")}
      onClick={() => onModeChange(m)}
      disabled={!unlocked && m !== "compact"}
      aria-pressed={mode === m}
    >
      {icon}
      <span className="ml-1 hidden sm:inline">{label}</span>
    </Button>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/90 p-2 shadow-sm backdrop-blur-sm max-w-[min(100vw-2rem,22rem)]">
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[10px]" onClick={onFitView}>
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          <span className="ml-1">Fit</span>
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[10px]" onClick={onToday}>
          <Crosshair className="h-3.5 w-3.5" aria-hidden />
          <span className="ml-1">Today</span>
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[10px]" onClick={onZoomReset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          <span className="ml-1">Reset zoom</span>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {modeBtn("compact", "Compact", <LayoutGrid className="h-3.5 w-3.5" />)}
        {modeBtn("readable", "Readable", <ListTree className="h-3.5 w-3.5" />)}
        {modeBtn("detailed", "Detailed", <Focus className="h-3.5 w-3.5" />)}
      </div>

      <Select value={scope} onValueChange={(v) => onScopeChange(v as GanttTimelineScope)}>
        <SelectTrigger className="h-9 text-xs" aria-label="Timeline scope">
          <SelectValue placeholder="Scope" />
        </SelectTrigger>
        <SelectContent>
          {SCOPES.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-xs">
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex flex-wrap gap-2">
        {unlocked ? (
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={showCriticalPath}
              onChange={(e) => onToggleCriticalPath(e.target.checked)}
            />
            Critical path
          </label>
        ) : null}
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={blockedOnly}
            onChange={(e) => onToggleBlockedOnly(e.target.checked)}
          />
          Blocked only
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={legendOpen}
            onChange={onToggleLegend}
          />
          Legend
        </label>
      </div>
    </div>
  );
}
