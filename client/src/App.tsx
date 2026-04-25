import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
/* VoiceCommandBar hosts the speech-recognition wiring, hotkey listener,
 * and its own Radix dialog. The bar is rendered on every authed surface
 * but only _activates_ on user input (Alt+V or the voice hotkey), so
 * the heavy speech-recognition pipeline behind it can wait until first
 * interaction. Lazy-load and wrap it in `<Suspense fallback={null}>`
 * — the hotkey dispatches through a ref on `useVoice()`, so the bar
 * can be absent at first paint without breaking shortcuts. */
const VoiceCommandBar = lazy(() =>
  import("@/components/voice-command-bar").then((m) => ({
    default: m.VoiceCommandBar,
  })),
);
import { InstallCtaBanner } from "@/components/install-cta-banner";
import { WalletTopBar } from "@/components/wallet-top-bar";
import { FeedbackNudgeDialog } from "@/components/feedback-nudge-dialog";
import { GeofenceNudgeBridge } from "@/components/geofence-nudge-bridge";
import { AdherenceNudges } from "@/components/adherence-nudges";
import { OfflineDataBanner } from "@/components/offline-data-banner";
import { OfflineBanner } from "@/components/offline-banner";
import { TaskOfflineSyncProvider } from "@/components/task-offline-sync-provider";
import { useIsMobile } from "@/hooks/use-mobile";
import { LayoutDashboard, List, CalendarDays, Brain, Mic, MicOff, Loader2, Gamepad2 } from "lucide-react";
// Eager: first-paint / auth-critical pages. Kept static so the initial chunk
// can render without a Suspense fallback flicker.
import Dashboard from "@/pages/dashboard";
import ExperienceConfirmPage from "@/pages/experience-confirm";
import LoginPage from "@/pages/login";
import LandingPage from "@/pages/landing";
import ContactPage from "@/pages/contact";
import NotFound from "@/pages/not-found";
import PrivacyPolicyPage from "@/pages/privacy";
import TermsOfServicePage from "@/pages/terms";

// Lazy: everything else. Vite's manualChunks pulls heavy vendor libs out of
// these chunks so a page chunk only carries that page's own code plus any
// page-specific deps. Routes that are hit far less than the dashboard
// (admin, billing-bridge, import-export, etc.) stay out of the initial
// bundle entirely.
const Tasks = lazy(() => import("@/pages/tasks"));
const Analytics = lazy(() => import("@/pages/analytics"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const ImportExport = lazy(() => import("@/pages/import-export"));
const GoogleSheetsSyncPage = lazy(() => import("@/pages/google-sheets-sync"));
const ChecklistPage = lazy(() => import("@/pages/checklist"));
const ShoppingPage = lazy(() => import("@/pages/shopping"));
const ShoppingSharedPage = lazy(() => import("@/pages/shopping-shared"));
const PlannerPage = lazy(() => import("@/pages/planner"));
const MiniGamesPage = lazy(() => import("@/pages/mini-games"));
const RewardsPage = lazy(() => import("@/pages/rewards"));
const SkillTreePage = lazy(() => import("@/pages/skill-tree"));
const PremiumPage = lazy(() => import("@/pages/premium"));
const BillingPage = lazy(() => import("@/pages/billing"));
const AccountPage = lazy(() => import("@/pages/account"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const AppealsPage = lazy(() => import("@/pages/appeals"));
const FeedbackPage = lazy(() => import("@/pages/feedback"));
const CommunityPage = lazy(() => import("@/pages/community"));
const CollabInboxPage = lazy(() => import("@/pages/collab-inbox"));
const VideoHuddlePage = lazy(() => import("@/pages/video-huddle"));
const MessagesPage = lazy(() => import("@/pages/messages"));
const BillingBridgePage = lazy(() => import("@/pages/billing-bridge"));
import { DeepLinkGate } from "@/components/marketing/deep-link-gate";
import { isValidAppPath } from "@/lib/app-routes";
import {
  getSafePostLoginPath,
  POST_LOGIN_REDIRECT_STORAGE_KEY,
} from "@/lib/post-login-redirect";
import { Link } from "wouter";
import { HotkeyHelpDialog } from "@/components/hotkey-help-dialog";
/* GlobalSearch is a modal fired by Ctrl/⌘+F (and the sidebar magnifying
 * glass). It pulls in the task-search query chain + keyboard nav, none
 * of which is needed at first paint. Lazy-load so the initial shell
 * chunk ships without the search dialog's deps. The callsite below
 * uses a null Suspense fallback: the dialog is closed on first render,
 * so there's nothing to flicker during chunk hydration. */
const GlobalSearch = lazy(() =>
  import("@/components/global-search").then((m) => ({
    default: m.GlobalSearch,
  })),
);
const CommandPalette = lazy(() =>
  import("@/components/command-palette").then((m) => ({
    default: m.CommandPalette,
  })),
);
import { ImmersiveShellProvider } from "@/hooks/use-immersive-shell";
import { matchHotkeyFromKeyboardEvent, voiceBarOpenRef } from "@/lib/hotkey-actions";
import type { Task } from "@shared/schema";
import { PretextShell } from "@/components/pretext/pretext-shell";
import { PretextShortcutsBeacon } from "@/components/pretext/pretext-shortcuts-beacon";
import { AlarmPanel } from "@/components/alarm-panel";

const AdminPageLazy = lazy(() => import("@/pages/admin"));

/* Lazy-load the voice/review bulk-action dialog + its framer-motion
 * AnimatePresence subtree. The dialog is only opened after a voice or
 * planner review match, so keeping it out of the initial shell chunk
 * saves framer-motion from the first-paint critical path. */
const BulkActionDialogLazy = lazy(
  () => import("@/components/bulk-action-dialog"),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
    </div>
  );
}

function AdminRoute() {
  // Kept for back-compat with app-admin-lazy.contract.test.ts which asserts
  // the pages/admin chunk stays lazy. The outer Suspense below would catch
  // it too, but keeping this local boundary means admin-specific loading
  // never blocks sibling routes from rendering their own fallbacks.
  return (
    <Suspense fallback={<RouteFallback />}>
      <AdminPageLazy />
    </Suspense>
  );
}

function Router() {
  // One outer Suspense covers every lazy page. Pages we keep eager
  // (Dashboard, Login, Landing, Contact, NotFound, ExperienceConfirm)
  // render without suspending.
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/import-export" component={ImportExport} />
        <Route path="/google-sheets" component={GoogleSheetsSyncPage} />
        <Route path="/checklist" component={ChecklistPage} />
        <Route path="/shopping" component={ShoppingPage} />
        <Route path="/shopping/shared/:listId" component={ShoppingSharedPage} />
        <Route path="/planner" component={PlannerPage} />
        <Route path="/mini-games" component={MiniGamesPage} />
        <Route path="/feedback" component={FeedbackPage} />
        <Route path="/community" component={CommunityPage} />
        <Route path="/collab" component={CollabInboxPage} />
        <Route path="/huddle" component={VideoHuddlePage} />
        <Route path="/messages" component={MessagesPage} />
        <Route path="/admin" component={AdminRoute} />
        <Route path="/rewards" component={RewardsPage} />
        <Route path="/skill-tree" component={SkillTreePage} />
        <Route path="/premium" component={PremiumPage} />
        <Route path="/billing" component={BillingPage} />
        <Route path="/account" component={AccountPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/appeals" component={AppealsPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/privacy" component={PrivacyPolicyPage} />
        <Route path="/terms" component={TermsOfServicePage} />
        <Route path="/billing-bridge" component={BillingBridgePage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ReviewDialogBridge() {
  const { reviewProposal, clearReviewProposal } = useVoice();
  if (!reviewProposal) return null;
  return (
    <Suspense fallback={null}>
      <BulkActionDialogLazy
        open={!!reviewProposal}
        onOpenChange={(open) => { if (!open) clearReviewProposal(); }}
        actions={reviewProposal.actions}
        message={reviewProposal.message}
        unmatched={reviewProposal.unmatched}
      />
    </Suspense>
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 axtask-chrome-surface rounded-none border-x-0 border-b-0 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)] dark:shadow-[0_-4px_28px_-10px_rgba(0,0,0,0.55)] safe-area-bottom">
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
  const safeRenderMode = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        disableScale: true,
        disableCvRows: true,
        disableAmbientFx: false,
      };
    }
    const qs = new URLSearchParams(window.location.search);
    const ff = qs.get("fx");
    return {
      // Stability-first default: avoid transformed app scroller unless explicitly requested.
      disableScale: ff !== "legacy-scale",
      // Stability-first default: disable row-level content-visibility unless explicitly requested.
      disableCvRows: ff !== "legacy-cv",
      // Allow emergency "safe visuals" mode via ?fx=safe.
      disableAmbientFx: ff === "safe",
    };
  }, []);
  const [location, setLocation] = useLocation();
  const { isActive: isTutorialActive, startTutorial, stopTutorial } = useTutorial();

  useRoutePersistence(Boolean(user) && !loading);

  const handleNavigate = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const toggleGlobalSearchLazy = useCallback(() => {
    setGlobalSearchOpen((wasOpen) => {
      if (wasOpen) return false;
      void import("@/components/global-search").then(() => {
        setGlobalSearchOpen(true);
      });
      return false;
    });
  }, []);

  const ensureGlobalSearchOpenLazy = useCallback(() => {
    setGlobalSearchOpen((wasOpen) => {
      if (wasOpen) return true;
      void import("@/components/global-search").then(() => {
        setGlobalSearchOpen(true);
      });
      return false;
    });
  }, []);

  const toggleCommandPaletteLazy = useCallback(() => {
    setCommandPaletteOpen((wasOpen) => {
      if (wasOpen) return false;
      void import("@/components/command-palette").then(() => {
        setCommandPaletteOpen(true);
      });
      return false;
    });
  }, []);

  const handleGlobalSearchSelect = useCallback(
    (task: Task) => {
      setLocation("/tasks");
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("axtask-open-task-edit", { detail: { task } }),
        );
      }, 50);
    },
    [setLocation],
  );

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
        case "openGlobalSearch": {
          if (!user || loading) return;
          e.preventDefault();
          toggleGlobalSearchLazy();
          break;
        }
        case "openCommandPalette": {
          if (!user || loading) return;
          e.preventDefault();
          toggleCommandPaletteLazy();
          break;
        }
        case "openAlarmPanel": {
          if (!user || loading) return;
          e.preventDefault();
          window.dispatchEvent(new Event("axtask-open-alarm-panel"));
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    user,
    loading,
    hotkeyHelpOpen,
    setLocation,
    isTutorialActive,
    startTutorial,
    stopTutorial,
    toggleGlobalSearchLazy,
    toggleCommandPaletteLazy,
  ]);

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

  useEffect(() => {
    if (!user || loading) return;
    const onOpenGlobalSearch = () => ensureGlobalSearchOpenLazy();
    window.addEventListener("axtask-open-global-search", onOpenGlobalSearch);
    return () => window.removeEventListener("axtask-open-global-search", onOpenGlobalSearch);
  }, [user, loading, ensureGlobalSearchOpenLazy]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    body.dataset.axtaskCvRows = safeRenderMode.disableCvRows ? "off" : "on";
    body.dataset.axtaskAmbientFx = safeRenderMode.disableAmbientFx ? "off" : "on";
    return () => {
      delete body.dataset.axtaskCvRows;
      delete body.dataset.axtaskAmbientFx;
    };
  }, [safeRenderMode.disableAmbientFx, safeRenderMode.disableCvRows]);

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
    if (location === "/privacy") {
      return <PrivacyPolicyPage />;
    }
    if (location === "/terms") {
      return <TermsOfServicePage />;
    }
    if (location === "/") {
      return <LandingPage />;
    }
    if (location === "/login") {
      return <LoginPage />;
    }
    const pathOnly = location.split("?")[0] || "";
    if (
      pathOnly !== "/" &&
      pathOnly !== "/login" &&
      pathOnly !== "/contact" &&
      pathOnly !== "/privacy" &&
      pathOnly !== "/terms"
    ) {
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
                !safeRenderMode.disableScale && scale !== 1
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
          {user ? <PretextShortcutsBeacon /> : null}
          {user ? <HotkeyHelpDialog open={hotkeyHelpOpen} onOpenChange={setHotkeyHelpOpen} /> : null}
          {user ? (
            /* Lazy Suspense with a null fallback — the dialog isn't
             * visible until the user triggers it, so there's nothing
             * to flicker during chunk hydration. */
            <Suspense fallback={null}>
              <GlobalSearch
                open={globalSearchOpen}
                onOpenChange={setGlobalSearchOpen}
                onSelectTask={handleGlobalSearchSelect}
              />
            </Suspense>
          ) : null}
          {user ? (
            <Suspense fallback={null}>
              <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
            </Suspense>
          ) : null}
          <TutorialOverlay />
          <TutorialInteractionGuide />
          {/* Voice bar chunk is also lazy — null fallback is safe
           * because the bar itself only opens on user input. */}
          <Suspense fallback={null}>
            <VoiceCommandBar />
          </Suspense>
          <ReviewDialogBridge />
          <AlarmPanel />
          <FeedbackNudgeDialog />
          <GeofenceNudgeBridge />
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
