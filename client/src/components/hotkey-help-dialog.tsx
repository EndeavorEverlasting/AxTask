import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KBD, SHORTCUT_FOCUS_NOTE } from "@/lib/keyboard-shortcuts";

const HOTKEY_ROWS = [
  {
    keys: `${KBD.sidebar} / ${KBD.sidebarMac}`,
    action: "Toggle sidebar (Pretext immersive: hide nav rail; use edge strip to restore)",
  },
  { keys: `${KBD.hotkeyHelp} / ${KBD.hotkeyHelpMac}`, action: "Open or close this shortcuts panel" },
  { keys: `${KBD.loginHelp} / ${KBD.loginHelpMac}`, action: "Show login/help" },
  { keys: `${KBD.dashboard} / ${KBD.dashboardMac}`, action: "Open dashboard (load all tasks)" },
  { keys: `${KBD.findTasks} / ${KBD.findTasksMac}`, action: "Find tasks (focus search)" },
  { keys: `${KBD.newTask} / ${KBD.newTaskMac}`, action: "New task (open composer)" },
  { keys: `${KBD.submitTask} / ${KBD.submitTaskMac} / ${KBD.submitTaskAlt}`, action: "Submit task form" },
  { keys: `${KBD.voice} / ${KBD.voiceMac}`, action: "Voice commands" },
  { keys: `${KBD.tutorialToggle} / ${KBD.tutorialToggleMac}`, action: "Toggle tutorial" },
] as const;

export function HotkeyHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground leading-relaxed">{SHORTCUT_FOCUS_NOTE}</p>
        <div className="space-y-3 py-2">
          {HOTKEY_ROWS.map(({ keys, action }) => (
            <div key={action} className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{action}</span>
              <kbd className="shrink-0 px-2 py-1 text-xs font-mono bg-muted rounded border border-border text-foreground">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
