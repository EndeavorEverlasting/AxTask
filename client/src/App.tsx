import { Switch, Route, useLocation } from "wouter";
import { useCallback, useEffect, useRef } from "react";
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
import { LayoutDashboard, List, CalendarDays, Brain, Mic } from "lucide-react";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import Analytics from "@/pages/analytics";
import CalendarPage from "@/pages/calendar";
import ImportExport from "@/pages/import-export";
import GoogleSheetsSyncPage from "@/pages/google-sheets-sync";
import ChecklistPage from "@/pages/checklist";
import PlannerPage from "@/pages/planner";
import AdminPage from "@/pages/admin";
import RewardsPage from "@/pages/rewards";
import PremiumPage from "@/pages/premium";
import BillingPage from "@/pages/billing";
import AccountPage from "@/pages/account";
import AppealsPage from "@/pages/appeals";
import FeedbackPage from "@/pages/feedback";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";

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
      <Route path="/feedback" component={FeedbackPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/rewards" component={RewardsPage} />
      <Route path="/premium" component={PremiumPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/appeals" component={AppealsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Ctrl+T / Cmd+T toggles post-auth tutorial only (avoids hijacking shortcut on login screen). */
function TutorialHotkeys() {
  const { isActive, startTutorial, stopTutorial } = useTutorial();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
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
];

function MobileBottomNav() {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
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
  const { openBar, isSupported } = useVoice();
  if (!isSupported) return null;

  return (
    <button
      className="md:hidden fixed right-4 bottom-20 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      onClick={openBar}
      aria-label="Voice command"
    >
      <Mic className="h-6 w-6" />
    </button>
  );
}

const ROUTE_STORAGE_KEY = "axtask_last_route";
/** Keep aligned with `<Router>` paths so last-route persistence matches real routes. */
const VALID_ROUTES = [
  "/",
  "/tasks",
  "/calendar",
  "/analytics",
  "/import-export",
  "/google-sheets",
  "/checklist",
  "/planner",
  "/feedback",
  "/admin",
  "/rewards",
  "/premium",
  "/billing",
  "/account",
];

function useRoutePersistence() {
  const [location, setLocation] = useLocation();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const pathname = window.location.pathname;
    if (pathname === "/" || pathname === "") {
      const saved = localStorage.getItem(ROUTE_STORAGE_KEY);
      if (saved && saved !== "/" && VALID_ROUTES.includes(saved)) {
        setLocation(saved);
      }
    }
  }, [setLocation]);

  useEffect(() => {
    if (location && location !== "/" && VALID_ROUTES.includes(location)) {
      localStorage.setItem(ROUTE_STORAGE_KEY, location);
    }
  }, [location]);
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  const { zoom } = useZoom();
  const isMobile = useIsMobile();
  const scale = isMobile ? 1 : zoom / 100;
  const [, setLocation] = useLocation();

  useRoutePersistence();

  const handleNavigate = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setLocation("/tasks?new=1");
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
    return <LoginPage />;
  }

  return (
    <VoiceProvider onNavigate={handleNavigate}>
      <TaskOfflineSyncProvider>
      <div className="h-dvh min-h-0 flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <OfflineDataBanner />
          <InstallCtaBanner userId={user.id} />
          <div
            className="min-h-0 flex-1 overflow-auto overscroll-contain pb-16 md:pb-0"
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
        <TutorialOverlay />
        <TutorialInteractionGuide />
        <VoiceCommandBar />
        <ReviewDialogBridge />
      </div>
      </TaskOfflineSyncProvider>
    </VoiceProvider>
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
