import { useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useNotificationMode } from "@/hooks/use-notification-mode";
import { useImmersiveSounds } from "@/hooks/use-immersive-sounds";

/** Immersive win/confirmation sounds — shared by Account and Settings. */
export function ImmersiveSoundsSettingsCard() {
  const { isLoading: notifPrefsLoading } = useNotificationMode();
  const { toast } = useToast();
  const {
    deviceScope,
    effectiveEnabled,
    setSoundsEnabled,
    setScope,
    playPreview,
  } = useImmersiveSounds();
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="h-5 w-5" />
          Immersive sounds
        </CardTitle>
        <CardDescription>
          Short sounds for wins and confirmations. How often they play follows your{" "}
          <span className="font-medium text-foreground">notification intensity</span> slider (lower = calmer; lowest tier
          stops at 50% or below).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="immersive-sounds-enabled">Enable immersive sounds</Label>
            <p className="text-xs text-muted-foreground">Independent of push notifications.</p>
          </div>
          <Switch
            id="immersive-sounds-enabled"
            checked={effectiveEnabled}
            disabled={notifPrefsLoading || pending}
            onCheckedChange={(checked) => {
              setPending(true);
              void (async () => {
                try {
                  await setSoundsEnabled(checked);
                } catch (e) {
                  console.error("[immersive-sounds] setSoundsEnabled failed:", e);
                  toast({
                    title: "Could not update sounds",
                    description: e instanceof Error ? e.message : "Please try again.",
                    variant: "destructive",
                  });
                } finally {
                  setPending(false);
                }
              })();
            }}
          />
        </div>

        <div className="space-y-3">
          <Label>Apply this setting</Label>
          <RadioGroup
            value={deviceScope}
            disabled={notifPrefsLoading || pending}
            onValueChange={(v) => {
              if (v !== "account" && v !== "local") return;
              setPending(true);
              void (async () => {
                try {
                  await setScope(v);
                } catch (e) {
                  console.error("[immersive-sounds] setScope failed:", e);
                  toast({
                    title: "Could not update sound scope",
                    description: e instanceof Error ? e.message : "Please try again.",
                    variant: "destructive",
                  });
                } finally {
                  setPending(false);
                }
              })();
            }}
            className="grid gap-3"
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="account" id="immersive-scope-account" className="mt-0.5" />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium leading-none">Sync across my devices</span>
                <span className="text-xs text-muted-foreground">
                  Saved to your account. Other browsers you use with AxTask can follow the same on/off state.
                </span>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="local" id="immersive-scope-local" className="mt-0.5" />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium leading-none">This device only</span>
                <span className="text-xs text-muted-foreground">
                  Stored only in this browser. Other devices are unaffected.
                </span>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!effectiveEnabled || pending}
            onClick={() => playPreview()}
          >
            Test sound
          </Button>
          <span className="text-xs text-muted-foreground">Preview uses the high-tier chime (volume follows your system).</span>
        </div>
      </CardContent>
    </Card>
  );
}
