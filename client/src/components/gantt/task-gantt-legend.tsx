import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface TaskGanttLegendProps {
  /** When false, only the trigger row shows (compact mode default). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export function TaskGanttLegend({ open, onOpenChange, className }: TaskGanttLegendProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={cn("rounded-lg border border-border bg-card/90 p-2 text-[10px] shadow-sm", className)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 font-semibold uppercase tracking-wide text-muted-foreground">
        Legend
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3 text-left">
        <section>
          <p className="font-semibold text-foreground mb-1">Priority</p>
          <ul className="space-y-1 text-muted-foreground">
            <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#ef4444]" /> Highest</li>
            <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#f97316]" /> High</li>
            <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#eab308]" /> Medium-High</li>
            <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Medium</li>
            <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#64748b]" /> Low</li>
          </ul>
        </section>
        <section>
          <p className="font-semibold text-foreground mb-1">Status</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>Solid bar — pending / in progress</li>
            <li>Faded bar — completed</li>
            <li>Dashed outline — blocked by incomplete predecessor</li>
            <li>Cyan ring — selected</li>
          </ul>
        </section>
        <section>
          <p className="font-semibold text-foreground mb-1">Dependency</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>Amber arrow — normal dependency</li>
            <li>Red arrow — critical path segment</li>
            <li>Gray arrow — predecessor completed</li>
            <li>Cyan arrow — selected dependency chain</li>
          </ul>
        </section>
        <section>
          <p className="font-semibold text-foreground mb-1">Time</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>Green vertical line — today</li>
            <li>Purple milestone — use detailed labels on task</li>
            <li>Red marker — hard deadline heuristics (Highest / audit / exam cues)</li>
          </ul>
        </section>
      </CollapsibleContent>
    </Collapsible>
  );
}
