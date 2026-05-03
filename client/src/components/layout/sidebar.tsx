import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  List,
  Moon,
  Sun,
  CheckSquare,
  LogOut,
  User,
  ZoomIn,
  ZoomOut,
  GraduationCap,
  Brain,
  Shield,
  Coins,
  Menu,
  Network,
  DatabaseBackup,
  Settings,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Upload,
  FileSpreadsheet,
  CalendarDays,
  ClipboardList,
  Users,
  ShoppingBag,
  MessageSquare,
  Bell,
  Trophy,
} from "lucide-react";
import { useTheme } from "../theme-provider";
import { useAuth } from "@/lib/auth-context";
import { useZoom } from "@/hooks/use-zoom";
import { useTutorial } from "@/hooks/use-tutorial";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCountUp } from "@/hooks/use-count-up";
import { Button } from "@/components/ui/button";
import { VoiceBarTrigger } from "@/components/voice-command-bar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const CORE_MENU_ITEMS = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/tasks", icon: List, label: "Tasks" },
  { path: "/planner", icon: Brain, label: "AI Planner", hasBadge: true },
  { path: "/messages", icon: MessageSquare, label: "Messages", hasUnreadBadge: true },
  { path: "/notifications", icon: Bell, label: "Notifications", hasNotifBadge: true },
  { path: "/skill-tree", icon: Network, label: "Skill Tree" },
  { path: "/backup", icon: DatabaseBackup, label: "Backup" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

const MORE_MENU_ITEMS = [
  { path: "/analytics", icon: BarChart3, label: "Analytics" },
  { path: "/calendar", icon: CalendarDays, label: "Calendar" },
  { path: "/community", icon: Users, label: "Community" },
  { path: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { path: "/rewards", icon: ShoppingBag, label: "Rewards Shop" },
  { path: "/checklist", icon: ClipboardList, label: "Print Checklist" },
  { path: "/import-export", icon: Upload, label: "Import/Export" },
  { path: "/google-sheets", icon: FileSpreadsheet, label: "Google Sheets" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { zoom, zoomIn, zoomOut, resetZoom, ZOOM_MIN, ZOOM_MAX } = useZoom();
  const { isActive: tutorialActive, startTutorial, stopTutorial, hasCompleted } = useTutorial();
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: unreadMessages } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unreadMessageCount = unreadMessages?.count ?? 0;

  const { data: unreadNotifications } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 60000,
    enabled: !!user,
  });
  const unreadNotifCount = unreadNotifications?.count ?? 0;

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

  const isMoreActive = MORE_MENU_ITEMS.some((item) => {
    if (item.path === "/" && location === "/") return true;
    if (item.path !== "/" && location.startsWith(item.path)) return true;
    return false;
  });

  useEffect(() => {
    if (isMoreActive) setMoreOpen(true);
  }, [isMoreActive]);

  const isActiveRoute = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const handleNavClick = () => {
    onNavigate?.();
  };

  const adminItem = user?.role === "admin" ? { path: "/admin", icon: Shield, label: "Security Admin" } : null;

  return (
    <div className="flex flex-col h-full outline-none" tabIndex={-1}>
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary flex items-center">
            <CheckSquare className="mr-2 h-6 w-6" />
            AxTask
          </h1>
          {!isMobile && <VoiceBarTrigger />}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Intelligent Task Management</p>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {CORE_MENU_ITEMS.map(({ path, icon: Icon, label, hasBadge, hasUnreadBadge, hasNotifBadge }: { path: string; icon: typeof LayoutDashboard; label: string; hasBadge?: boolean; hasUnreadBadge?: boolean; hasNotifBadge?: boolean }) => {
            const badge = hasBadge ? overdueCount : hasUnreadBadge ? unreadMessageCount : hasNotifBadge ? unreadNotifCount : 0;
            const badgeColor = hasUnreadBadge ? "bg-blue-500" : hasNotifBadge ? "bg-orange-500" : "bg-red-500";
            return (
              <li key={path}>
                <Link href={path}>
                  <div
                    id={`sidebar-link-${path}`}
                    className={`flex items-center p-3 rounded-lg font-medium transition-colors cursor-pointer min-h-[44px] ${
                      isActiveRoute(path)
                        ? "text-primary bg-blue-50 dark:bg-blue-900/30"
                        : "text-gray-600 dark:text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                    onClick={handleNavClick}
                  >
                    <Icon className="mr-3 h-5 w-5 shrink-0" />
                    {label}
                    {typeof badge === "number" && badge > 0 && (
                      <span className={`ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full ${badgeColor} px-1.5 text-[10px] font-bold text-white`}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}

          {adminItem && (
            <li>
              <Link href={adminItem.path}>
                <div
                  className={`flex items-center p-3 rounded-lg font-medium transition-colors cursor-pointer min-h-[44px] ${
                    isActiveRoute(adminItem.path)
                      ? "text-primary bg-blue-50 dark:bg-blue-900/30"
                      : "text-gray-600 dark:text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  onClick={handleNavClick}
                >
                  <adminItem.icon className="mr-3 h-5 w-5 shrink-0" />
                  {adminItem.label}
                </div>
              </Link>
            </li>
          )}

          <li>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`w-full flex items-center p-3 rounded-lg font-medium transition-colors cursor-pointer min-h-[44px] ${
                isMoreActive
                  ? "text-primary bg-blue-50 dark:bg-blue-900/30"
                  : "text-gray-600 dark:text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {moreOpen ? (
                <ChevronDown className="mr-3 h-5 w-5 shrink-0" />
              ) : (
                <ChevronRight className="mr-3 h-5 w-5 shrink-0" />
              )}
              More
            </button>
            {moreOpen && (
              <ul className="mt-1 ml-4 space-y-1 border-l-2 border-gray-100 dark:border-gray-700 pl-2">
                {MORE_MENU_ITEMS.map(({ path, icon: Icon, label }) => (
                  <li key={path}>
                    <Link href={path}>
                      <div
                        className={`flex items-center p-2.5 rounded-lg font-medium transition-colors cursor-pointer text-sm min-h-[40px] ${
                          isActiveRoute(path)
                            ? "text-primary bg-blue-50 dark:bg-blue-900/30"
                            : "text-gray-500 dark:text-gray-500 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                        onClick={handleNavClick}
                      >
                        <Icon className="mr-2.5 h-4 w-4 shrink-0" />
                        {label}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {wallet && (
          <Link href="/rewards">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 cursor-pointer hover:shadow-md transition-all duration-300 ${sparkle ? "ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30 scale-105" : ""}`}
              onClick={handleNavClick}
            >
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
          title="Toggle tutorial (Ctrl+Shift+T)"
          className={`w-full justify-between min-h-[44px] ${tutorialActive ? "bg-yellow-600 hover:bg-yellow-700 text-white" : ""}`}
        >
          <span className="flex items-center">
            <GraduationCap className="mr-2 h-4 w-4" />
            {tutorialActive ? "Exit Tutorial" : hasCompleted ? "Restart Tutorial" : "Start Tutorial"}
          </span>
          <kbd className="ml-2 text-[10px] font-mono opacity-60 bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">⌃T</kbd>
        </Button>

        {!isMobile && (
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
        )}

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
          className="w-full justify-start min-h-[44px]"
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
          onClick={() => { logout(); handleNavClick(); }}
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 min-h-[44px]"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  );
}

export function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onMenuOpen}>
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="text-lg font-bold text-primary flex items-center">
        <CheckSquare className="mr-2 h-5 w-5" />
        AxTask
      </h1>
      <div className="w-10" />
    </div>
  );
}

export function Sidebar() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "B") {
        e.preventDefault();
        if (isMobile) {
          setMobileOpen((v) => !v);
        } else {
          setCollapsed((v) => !v);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "/") {
        e.preventDefault();
        setShowHotkeys((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile]);

  if (isMobile) {
    return (
      <>
        <MobileTopBar onMenuOpen={() => setMobileOpen(true)} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] p-0 bg-white dark:bg-gray-800">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>App navigation menu</SheetDescription>
            </SheetHeader>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <HotkeyDialog open={showHotkeys} onOpenChange={setShowHotkeys} />
      </>
    );
  }

  return (
    <>
      <aside
        className={`bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200 dark:border-gray-700 flex-col shrink-0 hidden md:flex transition-all duration-200 overflow-hidden outline-none ${
          collapsed ? "w-0 border-r-0" : "w-64"
        }`}
      >
        {!collapsed && <SidebarContent />}
      </aside>
      <HotkeyDialog open={showHotkeys} onOpenChange={setShowHotkeys} />
    </>
  );
}

function HotkeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!open) return null;

  const hotkeys = [
    { keys: "Ctrl + Shift + B", action: "Toggle sidebar" },
    { keys: "Ctrl + Shift + /", action: "Show keyboard shortcuts" },
    { keys: "Ctrl + Enter", action: "Submit task form" },
    { keys: "Ctrl + M", action: "Voice commands" },
    { keys: "Ctrl + Shift + T", action: "Toggle tutorial" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-[400px] max-w-[90vw] border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h2>
        <div className="space-y-3">
          {hotkeys.map(({ keys, action }) => (
            <div key={keys} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">{action}</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
        <div className="mt-5 text-right">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </div>
    </div>
  );
}
