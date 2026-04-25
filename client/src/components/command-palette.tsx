import { useCallback, useEffect, useRef, useState } from "react";
import type { ParsedCommand } from "@shared/intent/intent-types";
import { parseNaturalCommand, commandNeedsFullReview } from "@shared/intent/parse-natural-command";
import { getCommandExecutionPolicy } from "@shared/intent/execution-policy";
import { useVoice } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Play } from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function summarizeParsed(cmd: ParsedCommand): string {
  if (cmd.kind === "unknown") return "No matching intent (server may still understand this phrase).";
  const parts: string[] = [cmd.kind];
  if (cmd.activity) parts.push(`activity: ${cmd.activity}`);
  if (cmd.date) parts.push(`date: ${cmd.date}`);
  if (cmd.time) parts.push(`time: ${cmd.time}`);
  if (cmd.recurrence && cmd.recurrence !== "none") parts.push(`recurrence: ${cmd.recurrence}`);
  if (cmd.navigationTarget) parts.push(`→ ${cmd.navigationTarget}`);
  if (cmd.searchQuery) parts.push(`search: ${cmd.searchQuery}`);
  if (cmd.kind === "planning_request" && cmd.planningTopic) {
    const t = cmd.planningTopic;
    parts.push(`topic: ${t.slice(0, 120)}${t.length > 120 ? "…" : ""}`);
  }
  parts.push(`confidence ${(cmd.confidence * 100).toFixed(0)}%`);
  const policy = getCommandExecutionPolicy(cmd);
  parts.push(`policy ${policy}`);
  if (commandNeedsFullReview(cmd)) parts.push("(review recommended)");
  return parts.join(" · ");
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { submitTextCommand, isProcessing } = useVoice();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const clock = useRef({ now: new Date(), todayStr: "" as string });

  useEffect(() => {
    if (open) {
      setText("");
      const n = new Date();
      clock.current = { now: n, todayStr: n.toISOString().slice(0, 10) };
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const parsed = (() => {
    if (!text.trim()) return null;
    return parseNaturalCommand(text, { now: clock.current.now, todayStr: clock.current.todayStr });
  })();

  const onSubmit = useCallback(() => {
    const t = text.trim();
    if (!t || isProcessing) return;
    submitTextCommand(t);
    onOpenChange(false);
  }, [text, isProcessing, submitTextCommand, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={() => onOpenChange(false)}
      >
        <DialogHeader>
          <DialogTitle>Command</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Type a natural-language command, review the parse, then run the same server pipeline as voice.
        </p>
        <div className="space-y-2">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="e.g. open calendar, find billing tasks, remind me…"
            autoComplete="off"
            className="font-mono text-sm"
            disabled={isProcessing}
            aria-label="Typed command"
          />
          {parsed && (
            <div
              className={cn(
                "rounded-md border p-3 text-sm",
                parsed.warnings.length > 0 ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-muted/30",
              )}
            >
              <p className="text-muted-foreground break-words">{summarizeParsed(parsed)}</p>
              {parsed.warnings.length > 0 ? (
                <ul className="mt-2 flex gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  <li className="min-w-0">
                    {parsed.warnings.map((w) => (
                      <span key={w} className="block">
                        {w}
                      </span>
                    ))}
                  </li>
                </ul>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!text.trim() || isProcessing}>
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="ml-2">Run</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
