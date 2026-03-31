import { Switch, Route, useLocation } from "wouter";
import { useCallback } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useZoom, ZoomProvider } from "@/hooks/use-zoom";
import { TutorialProvider } from "@/hooks/use-tutorial";
import { VoiceProvider } from "@/hooks/use-voice";
import { Sidebar } from "@/components/layout/sidebar";
import { TutorialOverlay } from "@/components/tutorial-overlay";
import { VoiceCommandBar } from "@/components/voice-command-bar";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import Analytics from "@/pages/analytics";
import CalendarPage from "@/pages/calendar";
import ImportExport from "@/pages/import-export";
import GoogleSheetsSyncPage from "@/pages/google-sheets-sync";
import ChecklistPage from "@/pages/checklist";
import PlannerPage from "@/pages/planner";
import AdminPage from "@/pages/admin";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

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
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  const { zoom } = useZoom();
  const scale = zoom / 100;
  const [, setLocation] = useLocation();

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
      <div className="h-screen flex bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <div
            className="h-full overflow-auto"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: `${100 / scale}%`,
              height: `${100 / scale}%`,
            }}
          >
            <Router />
          </div>
        </main>
        <TutorialOverlay />
        <VoiceCommandBar />
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
