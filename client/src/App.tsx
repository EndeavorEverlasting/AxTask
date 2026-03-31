import { Switch, Route, useLocation } from "wouter";
import { useState, useCallback, useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useZoom, ZoomProvider } from "@/hooks/use-zoom";
import { TutorialProvider } from "@/hooks/use-tutorial";
import { VoiceProvider, useVoice } from "@/hooks/use-voice";
import { Sidebar } from "@/components/layout/sidebar";
import { TutorialOverlay } from "@/components/tutorial-overlay";
import { VoiceCommandBar } from "@/components/voice-command-bar";
import { MobileVoiceOverlay } from "@/components/mobile-voice-overlay";
import BulkActionDialog from "@/components/bulk-action-dialog";
import { GlobalSearch } from "@/components/global-search";
import { useIsMobile } from "@/hooks/use-mobile";
import { LayoutDashboard, List, CalendarDays, Brain } from "lucide-react";
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
      <Route path="/admin" component={AdminPage} />
      <Route path="/rewards" component={RewardsPage} />
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


const ROUTE_STORAGE_KEY = "axtask_last_route";
const VALID_ROUTES = ["/", "/tasks", "/calendar", "/analytics", "/import-export", "/google-sheets", "/checklist", "/planner", "/admin", "/rewards"];

function useRoutePersistence() {
  const [location, setLocation] = useLocation();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const pathname = window.location.pathname;
      if (pathname === "/" || pathname === "") {
        const saved = localStorage.getItem(ROUTE_STORAGE_KEY);
        if (saved && saved !== "/" && VALID_ROUTES.includes(saved)) {
          setLocation(saved);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (location && location !== "/" && VALID_ROUTES.includes(location)) {
        localStorage.setItem(ROUTE_STORAGE_KEY, location);
      }
    } catch {}
  }, [location]);
}

import { setPendingEditTask } from "@/lib/pending-edit";

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  const { zoom } = useZoom();
  const isMobile = useIsMobile();
  const scale = isMobile ? 1 : zoom / 100;
  const [, setLocation] = useLocation();
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  useRoutePersistence();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setGlobalSearchOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNavigate = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <VoiceProvider onNavigate={handleNavigate}>
      <div className="h-screen flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <div
            className="h-full overflow-auto pb-16 md:pb-0"
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
        <MobileVoiceOverlay />
        <TutorialOverlay />
        <VoiceCommandBar />
        <ReviewDialogBridge />
        <GlobalSearch
          open={globalSearchOpen}
          onClose={() => setGlobalSearchOpen(false)}
          onSelectTask={(task) => {
            setPendingEditTask(task);
            setLocation("/tasks");
          }}
        />
      </div>
    </VoiceProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <ZoomProvider>
              <TutorialProvider>
                <AuthenticatedApp />
              </TutorialProvider>
            </ZoomProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
