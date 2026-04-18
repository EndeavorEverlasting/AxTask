import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTutorial } from "@/hooks/use-tutorial";
import { PersistedQueryLayer } from "./lib/app-query-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useZoom, ZoomProvider } from "@/hooks/use-zoom";
import { TutorialProvider } from "@/hooks/use-tutorial";
import { NotificationModeProvider } from "@/hooks/use-notification-mode";
import { VoiceProvider, useVoice } from "@/hooks/use-voice";
import { Sidebar } from "@/components/layout/sidebar";
import { TutorialOverlay } from "@/components/tutorial-overlay";
import { TutorialInteractionGuide } from "@/components/tutorial-interaction-guide";
import { VoiceCommandBar } from "@/components/voice-command-bar";
import { InstallCtaBanner } from "@/components/install-cta-banner";
import { WalletTopBar } from "@/components/wallet-top-bar";
import { FeedbackNudgeDialog } from "@/components/feedback-nudge-dialog";
import { AdherenceNudges } from "@/components/adherence-nudges";
import { OfflineDataBanner } from "@/components/offline-data-banner";
import { OfflineBanner } from "@/components/offline-banner";
import { TaskOfflineSyncProvider } from "@/components/task-offline-sync-provider";
import BulkActionDialog from "@/components/bulk-action-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { LayoutDashboard, List, CalendarDays, Brain, Mic, MicOff, Loader2, Gamepad2 } from "lucide-react";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import Analytics from "@/pages/analytics";
import CalendarPage from "@/pages/calendar";
import ImportExport from "@/pages/import-export";
import GoogleSheetsSyncPage from "@/pages/google-sheets-sync";
import ChecklistPage from "@/pages/checklist";
import ShoppingPage from "@/pages/shopping";
import PlannerPage from "@/pages/planner";
import MiniGamesPage from "@/pages/mini-games";
import RewardsPage from "@/pages/rewards";
import SkillTreePage from "@/pages/skill-tree";
import PremiumPage from "@/pages/premium";
import BillingPage from "@/pages/billing";
import AccountPage from "@/pages/account";
import SettingsPage from "@/pages/settings";
import AppealsPage from "@/pages/appeals";
import FeedbackPage from "@/pages/feedback";
import CommunityPage from "@/pages/community";
import CollabInboxPage from "@/pages/collab-inbox";
import VideoHuddlePage from "@/pages/video-huddle";
import ExperienceConfirmPage from "@/pages/experience-confirm";
import LoginPage from "@/pages/login";
import LandingPage from "@/pages/landing";
import ContactPage from "@/pages/contact";
import { DeepLinkGate } from "@/components/marketing/deep-link-gate";
import { isValidAppPath } from "@/lib/app-routes";
import {
  getSafePostLoginPath,
  POST_LOGIN_REDIRECT_STORAGE_KEY,
} from "@/lib/post-login-redirect";
import BillingBridgePage from "@/pages/billing-bridge";
import NotFound from "@/pages/not-found";
import { Link } from "wouter";
import { HotkeyHelpDialog } from "@/components/hotkey-help-dialog";
import { ImmersiveShellProvider } from "@/hooks/use-immersive-shell";
import { matchHotkeyFromKeyboardEvent, voiceBarOpenRef } from "@/lib/hotkey-actions";
import { PretextShell } from "@/components/pretext/pretext-shell";

const AdminPageLazy = lazy(() => import("@/pages/admin"));

function AdminRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] w-full items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        </div>
      }
    >
      <AdminPageLazy />
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/import-export" component={ImportExport} />
      <Route path="/google-sheets" component={GoogleSheetsSyncPage} />
      <Route path="/checklist" component={ChecklistPage} />
      <Route path="/shopping" component={ShoppingPage} />
      <Route path="/planner" component={PlannerPage} />
      <Route path="/mini-games" component={MiniGamesPage} />
      <Route path="/feedback" component={FeedbackPage} />
      <Route path="/community" component={CommunityPage} />
      <Route path="/collab" component={CollabInboxPage} />
      <Route path="/huddle" component={VideoHuddlePage} />
      <Route path="/admin" component={AdminRoute} />
      <Route path="/rewards" component={RewardsPage} />
      <Route path="/skill-tree" component={SkillTreePage} />
      <Route path="/premium" component={PremiumPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/appeals" component={AppealsPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/billing-bridge" component={BillingBridgePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ReviewDialogBridge() {
  const { reviewProposal, clearReviewProposal } = useVoice();
  if (!reviewProposal) return null;
  return (
    <BulkActionDialog
      open={!!reviewProposal}
      onOpenChange={(open) => { if (!open) clearReviewProposal(); }}
      actions={reviewProposal.actions}
      message={reviewProposal.message}
      unmatched={reviewProposal.unmatched}
    />
  );
}

const BOTTOM_NAV_ITEMS = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/tasks", icon: List, label: "Tasks" },
  { path: "/calendar", icon: CalendarDays, label: "Calendar" },
  { path: "/planner", icon: Brain, label: "Planner" },
  { path: "/mini-games", icon: Gamepad2, label: "Games" },
];

function MobileBottomNav() {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location === path || location.startsWith(`${path}/`);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-panel-glossy rounded-none border-x-0 border-b-0 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_28px_-10px_rgba(0,0,0,0.45)] safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {BOTTOM_NAV_ITEMS.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            href={path}
            className={`flex flex-col items-center justify-center flex-1 h-full min-w-[64px] min-h-[44px] transition-colors duration-150 no-underline ${
              isActive(path)
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] mt-0.5 font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function MobileVoiceFAB() {
  const { openBarAndToggleListening, isSupported, status, isProcessing } = useVoice();
  if (!isSupported) return null;

  const isListening = status === "listening";

  return (
    <button
      className="md:hidden fixed right-4 bottom-20 z-50 group"
      onClick={openBarAndToggleListening}
      aria-label={isListening ? "Listening — tap to stop" : "Hey AxTask — tap to speak"}
    >
      {/* Outer pulse rings — visible when listening */}
      {isListening && (
        <>
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 opacity-30 animate-ping" />
          <span className="absolute -inset-2 rounded-full bg-gradient-to-br from-violet-400/20 to-pink-400/20 animate-pulse" />
        </>
      )}
      {/* Main button */}
      <span
        className={`relative flex items-center justify-center w-16 h-16 rounded-full shadow-2xl transition-all duration-300 ${
          isListening
            ? "bg-gradient-to-br from-red-500 via-rose-500 to-pink-600 scale-110 shadow-red-500/40"
            : isProcessing
              ? "bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/30"
              : "bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 shadow-fuchsia-500/30 group-active:scale-95"
        }`}
      >
        {isProcessing ? (
          <Loader2 className="h-7 w-7 text-white animate-spin" />
        ) : isListening ? (
          <MicOff className="h-7 w-7 text-white" />
        ) : (
          <Mic className="h-7 w-7 text-white" />
        )}
      </span>
      {/* Label beneath */}
      <span className={`block text-center text-[9px] font-semibold mt-1 transition-colors ${
        isListening ? "text-red-500" : "text-fuchsia-600 dark:text-fuchsia-400"
      }`}>
        {isListening ? "Listening…" : "Hey AxTask"}
      </span>
    </button>
  );
}

const ROUTE_STORAGE_KEY = "axtask_last_route";

function useRoutePersistence(enabled: boolean) {
  const [location, setLocation] = useLocation();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (restoredRef.current) return;
    restoredRef.current = true;
    const pathname = window.location.pathname;
    if (pathname === "/" || pathname === "") {
      const saved = localStorage.getItem(ROUTE_STORAGE_KEY);
      const savedPath = saved ? saved.split("?")[0] : "";
      if (saved && saved !== "/" && isValidAppPath(savedPath)) {
        setLocation(saved);
      }
    }
  }, [enabled, setLocation]);

  useEffect(() => {
    if (!enabled) return;
    if (location && location !== "/" && isValidAppPath(location.split("?")[0])) {
      localStorage.setItem(ROUTE_STORAGE_KEY, location);
    }
  }, [enabled, location]);
}

function PostLoginRedirector() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (!user) consumedRef.current = false;
  }, [user]);

  useEffect(() => {
    if (!user || loading) return;
    if (consumedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    let target = getSafePostLoginPath(params.get("next"));
    if (!target) {
      try {
        const raw = sessionStorage.getItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
        target = getSafePostLoginPath(raw);
        if (target) sessionStorage.removeItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    if (target && target !== "/") {
      consumedRef.current = true;
      setLocation(target);
    }
  }, [user, loading, setLocation]);

  return null;
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  const { zoom } = useZoom();
  const isMobile = useIsMobile();
  const scale = isMobile ? 1 : zoom / 100;
  const [location, setLocation] = useLocation();
  const { isActive: isTutorialActive, startTutorial, stopTutorial } = useTutorial();

  useRoutePersistence(Boolean(user) && !loading);

  const handleNavigate = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = matchHotkeyFromKeyboardEvent(e, {
        hotkeyHelpOpen,
        isVoiceBarOpen: voiceBarOpenRef.current,
      });
      if (!m) return;

      switch (m.kind) {
        case "toggleHotkeyHelp": {
          if (!user || loading) return;
          e.preventDefault();
          setHotkeyHelpOpen((v) => !v);
          break;
        }
        case "toggleTutorial": {
          if (!user || loading) return;
          e.preventDefault();
          if (isTutorialActive) stopTutorial();
          else startTutorial();
          break;
        }
        case "navigate": {
          e.preventDefault();
          setLocation(m.path);
          m.postEvents?.forEach(({ name, delayMs }) => {
            setTimeout(() => window.dispatchEvent(new Event(name)), delayMs);
          });
          break;
        }
        case "closeHotkeyHelp": {
          if (!user || loading) return;
          e.preventDefault();
          setHotkeyHelpOpen(false);
          break;
        }
        case "voiceCloseBar": {
          e.preventDefault();
          window.dispatchEvent(new Event("axtask-close-voice-bar"));
          break;
        }
        case "closeMobileNav": {
          window.dispatchEvent(new Event("axtask-close-mobile-nav"));
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, loading, hotkeyHelpOpen, setLocation, isTutorialActive, startTutorial, stopTutorial]);

  useEffect(() => {
    if (!user || loading) return;
    const openHotkeyHelp = () => setHotkeyHelpOpen(true);
    window.addEventListener("axtask-open-hotkey-help", openHotkeyHelp);
    return () => window.removeEventListener("axtask-open-hotkey-help", openHotkeyHelp);
  }, [user, loading]);

  useEffect(() => {
    if (!user || loading) return;
    const onToggle = () => setHotkeyHelpOpen((v) => !v);
    window.addEventListener("axtask-toggle-hotkey-help", onToggle);
    return () => window.removeEventListener("axtask-toggle-hotkey-help", onToggle);
  }, [user, loading]);

  if (location === "/mfa/confirm" || location === "/welcome-confirm") {
    return <ExperienceConfirmPage />;
  }

  if (loading) {
    return (
      <div className="h-full min-h-0 overflow-y-auto flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    if (location === "/contact") {
      return <ContactPage />;
    }
    if (location === "/") {
      return <LandingPage />;
    }
    if (location === "/login") {
      return <LoginPage />;
    }
    const pathOnly = location.split("?")[0] || "";
    if (pathOnly !== "/" && pathOnly !== "/login" && pathOnly !== "/contact") {
      return <DeepLinkGate path={location} />;
    }
    return <LandingPage />;
  }

  return (
    <ImmersiveShellProvider>
    <VoiceProvider onNavigate={handleNavigate}>
      <TaskOfflineSyncProvider>
      <PostLoginRedirector />
      <OfflineBanner />
      {/* PretextShell mounts the aurora + orb + ambient-chip layers ONCE for
       * the authenticated surface so rAF loops and pointer listeners never
       * remount across wouter route changes. See
       * client/src/components/pretext/pretext-shell.tsx. */}
      <PretextShell className="relative isolate h-dvh min-h-0 w-full overflow-hidden">
        <div className="relative z-10 flex h-dvh min-h-0 flex-col md:flex-row overflow-hidden">
          <Sidebar />
          <main
            data-surface="calm"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            <OfflineDataBanner />
            <WalletTopBar />
            <InstallCtaBanner userId={user.id} />
            <AdherenceNudges />
            <div
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-16 md:pb-0 [scrollbar-gutter:stable]"
              style={
                scale !== 1
                  ? {
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      width: `${100 / scale}%`,
                      height: `${100 / scale}%`,
                    }
                  : undefined
              }
            >
              <Router />
            </div>
          </main>
          <MobileBottomNav />
          <MobileVoiceFAB />
          {user ? <HotkeyHelpDialog open={hotkeyHelpOpen} onOpenChange={setHotkeyHelpOpen} /> : null}
          <TutorialOverlay />
          <TutorialInteractionGuide />
          <VoiceCommandBar />
          <ReviewDialogBridge />
          <FeedbackNudgeDialog />
        </div>
      </PretextShell>
      </TaskOfflineSyncProvider>
    </VoiceProvider>
    </ImmersiveShellProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <PersistedQueryLayer>
            <ZoomProvider>
              <TutorialProvider>
                <NotificationModeProvider>
                  <AuthenticatedApp />
                </NotificationModeProvider>
              </TutorialProvider>
            </ZoomProvider>
          </PersistedQueryLayer>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
