import { useMutation, useQuery } from "@tanstack/react-query";
import { Mic, Smartphone, Waves } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserVoicePreference, VoiceListeningMode } from "@shared/schema";
import { VOICE_SHORTCUT_HINTS } from "@/lib/voice-shortcuts";

export function VoicePreferencesSettingsCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<UserVoicePreference>({
    queryKey: ["/api/voice/preferences"],
  });

  const mode: VoiceListeningMode =
    data?.listeningMode === "manual" ? "manual" : "wake_after_first_use";

  const mutation = useMutation({
    mutationFn: async (listeningMode: VoiceListeningMode) => {
      const res = await apiRequest("PATCH", "/api/voice/preferences", { listeningMode });
      return res.json() as Promise<UserVoicePreference>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/voice/preferences"] });
    },
    onError: (e: Error) => {
      toast({
        title: "Could not save",
        description: e.message || "Try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="glass-panel border-violet-200/40 dark:border-violet-900/40">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          Voice &amp; microphone
        </CardTitle>
        <CardDescription>
          These choices sync to your account. The browser still controls when the mic can run (usually after you tap
          something). Speech is processed in your browser; only the command you intend to run is sent to the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-muted bg-muted/20 p-3 text-sm text-muted-foreground">
          <Smartphone className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <p>
            On phones, use the floating mic or the mic in the top bar to open voice. Safari and some browsers limit live
            speech recognition; if nothing happens, try Chrome or Edge on Android, or check site settings for microphone
            access.
          </p>
        </div>

        <RadioGroup
          value={mode}
          onValueChange={(v) => {
            if (v === "manual" || v === "wake_after_first_use") mutation.mutate(v);
          }}
          disabled={isLoading || mutation.isPending}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 rounded-lg border border-muted p-3">
            <RadioGroupItem value="manual" id="voice-mode-manual" className="mt-1" />
            <div className="grid gap-1">
              <Label htmlFor="voice-mode-manual" className="font-medium cursor-pointer">
                Manual (push-to-talk)
              </Label>
              <p className="text-sm text-muted-foreground">
                The app listens only while you have opened the voice bar and started the mic. No background shortcut
                listener after you finish.
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3 rounded-lg border border-muted p-3">
            <RadioGroupItem value="wake_after_first_use" id="voice-mode-wake" className="mt-1" />
            <div className="grid gap-1">
              <Label htmlFor="voice-mode-wake" className="font-medium cursor-pointer flex items-center gap-2">
                <Waves className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Wake-style shortcuts (after first mic use)
              </Label>
              <p className="text-sm text-muted-foreground">
                After you successfully use the command mic once in this browser session, AxTask can keep listening for
                shortcut phrases in the background until you leave or close the tab. You can still open the voice bar
                anytime.
              </p>
            </div>
          </div>
        </RadioGroup>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Example phrases (when supported)</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {VOICE_SHORTCUT_HINTS.slice(0, 6).map((h) => (
              <li key={h.action}>
                <span className="font-medium text-foreground">{h.label}</span>
                <span className="text-muted-foreground"> — {h.examples.join("; ")}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
