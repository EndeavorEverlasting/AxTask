import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallShortcut } from "@/hooks/use-install-shortcut";
import { getInstallInstructions } from "@/lib/install-shortcut";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface InstallCtaBannerProps {
  userId: string;
}

const DEVICE_STATE_KEY = "axtask.install.device.v1";

type DeviceInstallState = {
  /** User hid the banner for this session/device without opting out forever */
  dismissed?: boolean;
  /** Never show install prompts on this device */
  optOut?: boolean;
};

function readDeviceState(): DeviceInstallState {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(DEVICE_STATE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DeviceInstallState;
  } catch {
    return {};
  }
}

function writeDeviceState(partial: Partial<DeviceInstallState>): void {
  if (typeof localStorage === "undefined") return;
  try {
    const next = { ...readDeviceState(), ...partial };
    localStorage.setItem(DEVICE_STATE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function InstallCtaBanner({ userId }: InstallCtaBannerProps) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { canPromptInstall, isInstalled, platform, install } = useInstallShortcut();

  useEffect(() => {
    if (isInstalled) {
      writeDeviceState({ dismissed: true });
    }
  }, [isInstalled]);

  useEffect(() => {
    if (!userId || isInstalled) {
      setVisible(false);
      return;
    }
    const st = readDeviceState();
    if (st.optOut || st.dismissed) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [isInstalled, userId]);

  const instructions = useMemo(() => getInstallInstructions(platform), [platform]);

  const dismiss = () => {
    writeDeviceState({ dismissed: true });
    setVisible(false);
  };

  const dontShowAgain = () => {
    writeDeviceState({ optOut: true, dismissed: true });
    setVisible(false);
  };

  const handleInstall = async () => {
    if (canPromptInstall) {
      const result = await install();
      if (result === "accepted") {
        writeDeviceState({ dismissed: true });
        toast({
          title: "Shortcut installed",
          description: "AxTask is now available from your home screen or desktop.",
        });
        setVisible(false);
      } else if (result === "dismissed") {
        toast({
          title: "Install canceled",
          description: "You can install AxTask later from the sidebar.",
        });
      } else {
        setOpen(true);
      }
      return;
    }
    setOpen(true);
  };

  if (!visible) return null;

  return (
    <>
      <div className="mx-6 mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <p className="font-semibold">Install AxTask for one-tap access</p>
            <p className="text-xs opacity-90">Add it to your desktop or mobile home screen on this device.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleInstall}>
              <Download className="mr-2 h-4 w-4" />
              Install
            </Button>
            <Button size="sm" variant="outline" onClick={dismiss}>
              Dismiss
            </Button>
            <Button size="sm" variant="ghost" onClick={dontShowAgain}>
              <X className="mr-1 h-3 w-3" />
              Don&apos;t show again (this device)
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install AxTask Shortcut</DialogTitle>
            <DialogDescription>
              Follow these steps to add AxTask to your device home screen.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-2">
            {instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
