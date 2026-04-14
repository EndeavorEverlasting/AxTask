import { Switch, Route, useLocation } from "wouter";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { OfflineDataBanner } from "@/components/offline-data-banner";
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
import PlannerPage from "@/pages/planner";
import MiniGamesPage from "@/pages/mini-games";
import AdminPage from "@/pages/admin";
import RewardsPage from "@/pages/rewards";
import PremiumPage from "@/pages/premium";
import BillingPage from "@/pages/billing";
import AccountPage from "@/pages/account";
import AppealsPage from "@/pages/appeals";
import FeedbackPage from "@/pages/feedback";
import CommunityPage from "@/pages/community";
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
      <Route path="/planner" component={PlannerPage} />
      <Route path="/mini-games" component={MiniGamesPage} />
      <Route path="/feedback" component={FeedbackPage} />
      <Route path="/community" component={CommunityPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/rewards" component={RewardsPage} />
      <Route path="/premium" component={PremiumPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/appeals" component={AppealsPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/billing-bridge" component={BillingBridgePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Ctrl+Shift+Y / Cmd+Shift+Y toggles tutorial (avoids Ctrl/Cmd+T and Ctrl/Cmd+Shift+T reserved for browser tabs). */
function TutorialHotkeys() {
  const { isActive, startTutorial, stopTutorial } = useTutorial();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.shiftKey && (e.ctrlKey || e.metaKey) && k === "y") {
        e.preventDefault();
        if (isActive) stopTutorial();
        else startTutorial();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, startTutorial, stopTutorial]);
  return null;
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {BOTTOM_NAV_ITEMS.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            href={path}
            className={`flex flex-col items-center justify-center flex-1 h-full min-w-[64px] min-h-[44px] transition-colors no-underline ${
              isActive(path)
                ? "text-primary"
                : "text-gray-400 dark:text-gray-500"
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
      if (saved && saved !== "/" && isValidAppPath(saved)) {
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

  useRoutePersistence(Boolean(user) && !loading);

  if (location === "/mfa/confirm" || location === "/welcome-confirm") {
    return <ExperienceConfirmPage />;
  }

  const handleNavigate = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false);

  useEffect(() => {
    if (!user || loading) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Slash") {
        e.preventDefault();
        setHotkeyHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, loading]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "t") {
        e.preventDefault();
        setLocation("/");
      } else if (k === "n") {
        e.preventDefault();
        setLocation("/tasks");
        // Fire event so tasks page shows the composer form
        setTimeout(() => window.dispatchEvent(new Event("axtask-open-new-task")), 50);
      } else if (k === "f") {
        e.preventDefault();
        setLocation("/tasks");
        // Fire event so task-list focuses the search input
        setTimeout(() => window.dispatchEvent(new Event("axtask-focus-task-search")), 50);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setLocation]);

  if (loading) {
    return (
      <div className="h-full min-h-0 overflow-y-auto flex items-center justify-center bg-gray-50 dark:bg-gray-900">
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
      <div className="h-dvh min-h-0 flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <OfflineDataBanner />
          <InstallCtaBanner userId={user.id} />
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
        <TutorialHotkeys />
        {user ? <HotkeyHelpDialog open={hotkeyHelpOpen} onOpenChange={setHotkeyHelpOpen} /> : null}
        <TutorialOverlay />
        <TutorialInteractionGuide />
        <VoiceCommandBar />
        <ReviewDialogBridge />
      </div>
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
