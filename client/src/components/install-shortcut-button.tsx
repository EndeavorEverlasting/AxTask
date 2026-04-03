import { useMemo, useState } from "react";
import { CheckCircle2, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useInstallShortcut } from "@/hooks/use-install-shortcut";
import { getInstallInstructions } from "@/lib/install-shortcut";
import { useToast } from "@/hooks/use-toast";

export function InstallShortcutButton() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { canPromptInstall, isInstalled, platform, install } = useInstallShortcut();

  const instructions = useMemo(() => getInstallInstructions(platform), [platform]);

  const handleInstallClick = async () => {
    if (isInstalled) {
      toast({
        title: "Shortcut already installed",
        description: "The app is already installed on this device.",
      });
      return;
    }

    if (canPromptInstall) {
      try {
        const result = await install();
        if (result === "accepted") {
          toast({
            title: "Shortcut installed",
            description: "You can now launch AxTask from your home screen or desktop.",
          });
        } else if (result === "dismissed") {
          toast({
            title: "Install canceled",
            description: "You can install again anytime from this button.",
          });
        } else {
          setOpen(true);
        }
      } catch {
        setOpen(true);
      }
      return;
    }

    setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleInstallClick}
          className="w-full justify-start"
        >
          {isInstalled ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
              Shortcut Installed
            </>
          ) : (
            <>
              <Smartphone className="mr-2 h-4 w-4" />
              Install App Shortcut
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Install AxTask Shortcut
          </DialogTitle>
          <DialogDescription>
            Add AxTask to your desktop or mobile home screen.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-2">
          {instructions.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
