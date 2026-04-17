import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  GraduationCap,
  Keyboard,
  Moon,
  SlidersHorizontal,
  Sparkles,
  Sun,
  UserRoundCog,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import { useZoom } from "@/hooks/use-zoom";
import { useTutorial } from "@/hooks/use-tutorial";
import { useIsMobile } from "@/hooks/use-mobile";
import { KBD, SUBMIT_TASK_SHORTCUTS, tutorialToggleTitle } from "@/lib/keyboard-shortcuts";
import { NotificationIntensityPanel } from "@/components/settings/notification-intensity-panel";
import { ImmersiveSoundsSettingsCard } from "@/components/settings/immersive-sounds-settings-card";
import { VoicePreferencesSettingsCard } from "@/components/settings/voice-preferences-settings-card";
import { InstallShortcutButton } from "@/components/install-shortcut-button";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/ui/glass-panel";
import { FloatingChip } from "@/components/ui/floating-chip";

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { zoom, zoomIn, zoomOut, resetZoom, ZOOM_MIN, ZOOM_MAX } = useZoom();
  const { startTutorial } = useTutorial();
  const isMobile = useIsMobile();

  const goHomeAndTour = () => {
    setLocation("/");
    queueMicrotask(() => startTutorial());
  };

  const openHotkeyHelp = () => {
    window.dispatchEvent(new Event("axtask-open-hotkey-help"));
  };

  return (
    <div className="min-h-0 p-4 md:p-8 max-w-2xl mx-auto space-y-8 pb-24">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to app
      </Link>

      <GlassPanel
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 border-dashed border-primary/25 bg-gradient-to-br from-violet-500/10 via-background to-amber-500/10 p-6 shadow-sm",
          "dark:from-violet-900/20 dark:via-background dark:to-amber-900/15",
        )}
      >
        <div className="pointer-events-none absolute -right-6 -top-4 rotate-12 text-primary/15">
          <Sparkles className="h-24 w-24" aria-hidden />
        </div>
        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">Mission control</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-2 ring-primary/20 -rotate-3">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
              </span>
              Settings
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              Tweak how AxTask feels—without digging through sidebars. Still flat? That&apos;s just the calm before the
              productivity storm.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <FloatingChip tone="neutral">Mission control</FloatingChip>
              <FloatingChip tone="success">Guided setup</FloatingChip>
            </div>
          </div>
        </div>
      </GlassPanel>

      <Card className="glass-panel-interactive border-primary/15 shadow-md shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-mono">Look &amp; scale</span>
            Appearance
          </CardTitle>
          <CardDescription>Theme and zoom (desktop). Mobile stays at 100% for sanity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" type="button" onClick={toggleTheme} className="w-full sm:w-auto justify-start gap-2">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </Button>
          {!isMobile && (
            <div className="flex items-center justify-between max-w-xs rounded-lg border bg-muted/30 px-2 py-1.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={resetZoom}
                className="text-xs font-medium text-muted-foreground hover:text-foreground min-w-[3rem]"
              >
                {zoom}%
              </button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Notifications</CardTitle>
          <CardDescription>Same controls as the sidebar—now in one place for obsessive tweakers.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationIntensityPanel />
        </CardContent>
      </Card>

      <ImmersiveSoundsSettingsCard />

      <VoicePreferencesSettingsCard />

      <Card className="glass-panel border-amber-200/50 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            Guided tour
          </CardTitle>
          <CardDescription>
            Jump home and run the full walkthrough ({tutorialToggleTitle()} toggles anytime).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={goHomeAndTour} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Launch guided tour from the start
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard
          </CardTitle>
          <CardDescription>
            Submit tasks with {SUBMIT_TASK_SHORTCUTS}. Open the cheat sheet anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={openHotkeyHelp}>
            Open shortcuts panel
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg">Install</CardTitle>
          <CardDescription>Add AxTask to your home screen when your OS allows it.</CardDescription>
        </CardHeader>
        <CardContent>
          <InstallShortcutButton />
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserRoundCog className="h-5 w-5" />
            Account &amp; security
          </CardTitle>
          <CardDescription>Profile, MFA, phone, and appeals live on the account page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/account">
            <Button variant="outline" type="button">
              Open account
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
