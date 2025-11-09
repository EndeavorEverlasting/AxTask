import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import CalendarPage from "@/pages/calendar";
import Analytics from "@/pages/analytics";
import ImportExport from "@/pages/import-export";
import GoogleSheetsSyncPage from "@/pages/google-sheets-sync";
import NotFound from "@/pages/not-found";
import { QuickFind } from "./components/quick-find";
import { type Task } from "@shared/schema";
import { Dialog, DialogContent } from "./components/ui/dialog";
import { TaskForm } from "./components/task-form";

function Router() {
  const [quickFindOpen, setQuickFindOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F or Cmd+F opens Quick Find (desktop only)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Check if mobile
        const isMobile = window.innerWidth < 768;
        if (!isMobile) {
          // Prevent default browser find
          e.preventDefault();
          setQuickFindOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/tasks" component={Tasks} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/import-export" component={ImportExport} />
          <Route path="/google-sheets" component={GoogleSheetsSyncPage} />
          <Route component={NotFound} />
        </Switch>
      </main>

      {/* Global Quick Find */}
      <QuickFind
        isOpen={quickFindOpen}
        onClose={() => setQuickFindOpen(false)}
        onSelectTask={(task) => setSelectedTask(task)}
      />

      {/* Task Details Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedTask && <TaskForm task={selectedTask} onSuccess={() => setSelectedTask(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;