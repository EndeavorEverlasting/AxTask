import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Plus,
  List,
  BarChart3,
  Upload,
  Settings,
  Moon,
  Sun,
  FileSpreadsheet,
  CalendarDays,
  LogOut,
  User,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ClipboardList,
  GraduationCap,
  Brain,
  Shield,
  Coins,
  ShoppingBag,
} from "lucide-react";
import { useTheme } from "../theme-provider";
import { useAuth } from "@/lib/auth-context";
import { useZoom } from "@/hooks/use-zoom";
import { useTutorial } from "@/hooks/use-tutorial";
import { useState, useEffect, useRef } from "react";
import { useCountUp } from "@/hooks/use-count-up";
import { Button } from "@/components/ui/button";
import { VoiceBarTrigger } from "@/components/voice-command-bar";

export function Sidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { zoom, zoomIn, zoomOut, resetZoom, ZOOM_MIN, ZOOM_MAX } = useZoom();
  const { isActive: tutorialActive, startTutorial, stopTutorial, hasCompleted } = useTutorial();

  const { data: briefing } = useQuery<{ overdue: { count: number }; dueWithinHour: { count: number } }>({
    queryKey: ["/api/planner/briefing"],
    refetchInterval: 60000,
  });
  const overdueCount = (briefing?.overdue?.count || 0) + (briefing?.dueWithinHour?.count || 0);

  const { data: wallet } = useQuery<{ balance: number; currentStreak: number }>({
    queryKey: ["/api/gamification/wallet"],
    refetchInterval: 30000,
  });
  const animatedBalance = useCountUp(wallet?.balance ?? 0);
  const [sparkle, setSparkle] = useState(false);
  const prevBalanceRef = useRef(0);
  useEffect(() => {
    const bal = wallet?.balance ?? 0;
    if (bal > prevBalanceRef.current && prevBalanceRef.current > 0) {
      setSparkle(true);
      const t = setTimeout(() => setSparkle(false), 1200);
      return () => clearTimeout(t);
    }
    prevBalanceRef.current = bal;
  }, [wallet?.balance]);

  const menuItems = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/planner", icon: Brain, label: "AI Planner", badge: overdueCount },
    { path: "/tasks", icon: List, label: "All Tasks" },
    { path: "/calendar", icon: CalendarDays, label: "Calendar" },
    { path: "/analytics", icon: BarChart3, label: "Analytics" },
    { path: "/rewards", icon: ShoppingBag, label: "Rewards Shop" },
    { path: "/checklist", icon: ClipboardList, label: "Print Checklist" },
    { path: "/import-export", icon: Upload, label: "Import/Export" },
    { path: "/google-sheets", icon: FileSpreadsheet, label: "Google Sheets" },
    ...(user?.role === "admin" ? [{ path: "/admin", icon: Shield, label: "Security Admin" }] : []),
  ];

  const isActiveRoute = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary flex items-center">
            <img
              src="/branding/axtask-logo.png"
              alt="AxTask logo"
              className="mr-2 h-6 w-6 rounded-sm object-cover"
            />
            AxTask
          </h1>
          <VoiceBarTrigger />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Intelligent Task Management</p>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map(({ path, icon: Icon, label, badge }) => (
            <li key={path}>
              <Link href={path}>
                <div
                  id={`sidebar-link-${path}`}
                  className={`flex items-center p-3 rounded-lg font-medium transition-colors cursor-pointer ${
                  isActiveRoute(path)
                    ? "text-primary bg-blue-50 dark:bg-blue-900/30"
                    : "text-gray-600 dark:text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}>
                  <Icon className="mr-3 h-5 w-5" />
                  {label}
                  {typeof badge === "number" && badge > 0 && (
                    <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {wallet && (
          <Link href="/rewards">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 cursor-pointer hover:shadow-md transition-all duration-300 ${sparkle ? "ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30 scale-105" : ""}`}>
              <Coins className={`h-4 w-4 text-amber-500 transition-transform ${sparkle ? "animate-spin" : ""}`} />
              <span className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">{animatedBalance}</span>
              <span className="text-xs text-amber-600 dark:text-amber-400">AxCoins</span>
              {sparkle && <span className="text-xs animate-bounce">✨</span>}
              {(wallet.currentStreak ?? 0) > 0 && (
                <span className="ml-auto text-xs text-orange-500 font-medium">🔥{wallet.currentStreak}</span>
              )}
            </div>
          </Link>
        )}

        <Button
          variant={tutorialActive ? "default" : "outline"}
          size="sm"
          onClick={tutorialActive ? stopTutorial : startTutorial}
          title="Toggle tutorial (Ctrl+T)"
          className={`w-full justify-between ${tutorialActive ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}`}
        >
          <span className="flex items-center">
            <GraduationCap className="mr-2 h-4 w-4" />
            {tutorialActive ? "Exit Tutorial" : hasCompleted ? "Restart Tutorial" : "Start Tutorial"}
          </span>
          <kbd className="ml-2 text-[10px] font-mono opacity-60 bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">⌃T</kbd>
        </Button>

        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700/50">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            onClick={resetZoom}
            className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-primary transition-colors min-w-[3rem] text-center"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        {user && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 truncate">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="h-5 w-5 rounded-full shrink-0" />
            ) : (
              <User className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{user.displayName || user.email}</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start"
        >
          {theme === "dark" ? (
            <>
              <Sun className="mr-2 h-4 w-4" />
              Light Mode
            </>
          ) : (
            <>
              <Moon className="mr-2 h-4 w-4" />
              Dark Mode
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </aside>
  );
}
