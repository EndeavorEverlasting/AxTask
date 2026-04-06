import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  List,
  BarChart3,
  Upload,
  Moon,
  Sun,
  FileSpreadsheet,
  CalendarDays,
  LogOut,
  User,
  ZoomIn,
  ZoomOut,
  ClipboardList,
  GraduationCap,
  Brain,
  Shield,
  Coins,
  ShoppingBag,
  MessageSquare,
  PlusCircle,
  Crown,
  BellRing,
  CreditCard,
  UserRoundCog,
  Menu,
  CheckSquare,
  Mail,
} from "lucide-react";
import { useTheme } from "../theme-provider";
import { useAuth } from "@/lib/auth-context";
import { useZoom } from "@/hooks/use-zoom";
import { useTutorial } from "@/hooks/use-tutorial";
import { useNotificationMode } from "@/hooks/use-notification-mode";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCountUp } from "@/hooks/use-count-up";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { VoiceBarTrigger } from "@/components/voice-command-bar";
import { InstallShortcutButton } from "@/components/install-shortcut-button";
import { KBD, tutorialToggleTitle } from "@/lib/keyboard-shortcuts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useImmersiveShell } from "@/hooks/use-immersive-shell";
import { PretextPeekStrip } from "@/components/layout/pretext-peek-strip";
import { ShellSplitter } from "@/components/layout/shell-splitter";
import { cn } from "@/lib/utils";
import type { SafeUser } from "@shared/schema";

function userInitials(u: Pick<SafeUser, "displayName" | "email">): string {
  const base = (u.displayName || u.email || "").trim();
  return base
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function AccountUserAvatar({
  user,
  className,
}: {
  user: Pick<SafeUser, "displayName" | "email" | "profileImageUrl">;
  className?: string;
}) {
  const initials = userInitials(user);
  const wrap = cn("rounded-full shrink-0 object-cover", className);
  if (user.profileImageUrl) {
    return <img src={user.profileImageUrl} alt="" className={wrap} />;
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-primary/15 text-primary font-semibold shrink-0",
        className,
      )}
    >
      {initials ? <span className="leading-none">{initials}</span> : <User className="h-4 w-4" />}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { zoom, zoomIn, zoomOut, resetZoom, ZOOM_MIN, ZOOM_MAX } = useZoom();
  const { isActive: tutorialActive, startTutorial, stopTutorial, hasCompleted } = useTutorial();
  const isMobile = useIsMobile();
  const {
    isLoading: notificationLoading,
    enabled: notificationEnabled,
    intensity: notificationIntensity,
    pushStatus,
    toggleNotificationMode,
    setLocalIntensity,
    saveIntensity,
  } = useNotificationMode();

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
    { path: "/premium", icon: Crown, label: "Premium" },
    { path: "/billing", icon: CreditCard, label: "Billing" },
    { path: "/account", icon: UserRoundCog, label: "Account" },
    { path: "/feedback", icon: MessageSquare, label: "Feedback" },
    { path: "/contact", icon: Mail, label: "Contact" },
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

  const notificationStatusLabel = (() => {
    if (pushStatus === "unsupported") return "Not supported";
    if (pushStatus === "denied") return "Permission denied";
    if (!notificationEnabled) return "Off";
    return `On (${notificationIntensity}%)`;
  })();

  const handleNavClick = () => {
    onNavigate?.();
  };

  return (
    <div className="flex flex-col h-full min-h-0 outline-none" tabIndex={-1}>
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
          {!isMobile && <VoiceBarTrigger />}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Intelligent Task Management</p>
      </div>

      <nav className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain">
        <ul className="space-y-1">
          {menuItems.map(({ path, icon: Icon, label, badge }) => (
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
        <Link href="/tasks?new=1">
          <Button
            size="sm"
            className="w-full justify-between bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg"
            title={`Create task (${KBD.newTask} / ${KBD.newTaskMac} — click in the page if the browser captures the key)`}
          >
            <span className="flex items-center">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Task
            </span>
            <kbd className="ml-2 text-[10px] font-mono opacity-70 bg-black/20 px-1 py-0.5 rounded">⌃N</kbd>
          </Button>
        </Link>

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
          title={`Toggle tutorial (${tutorialToggleTitle()})`}
          className={`w-full justify-between min-h-[44px] ring-1 ring-purple-400/40 ${
            tutorialActive ? "bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/30" : "bg-purple-50/60 dark:bg-purple-900/20"
          }`}
        >
          <span className="flex items-center">
            <GraduationCap className="mr-2 h-4 w-4" />
            {tutorialActive ? "Exit Tutorial" : hasCompleted ? "Restart Tutorial" : "Start Tutorial"}
          </span>
          <kbd className="ml-2 text-[10px] font-mono opacity-60 bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">⌃⇧Y</kbd>
        </Button>

        <div className="rounded-lg border border-sky-300/40 bg-sky-50/60 p-3 dark:border-sky-700/40 dark:bg-sky-900/15">
          <Button
            variant={notificationEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => void toggleNotificationMode()}
            disabled={notificationLoading}
            className={`w-full justify-between ring-1 ring-sky-400/40 ${
              notificationEnabled ? "bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-500/30" : "bg-sky-50/70 dark:bg-sky-900/20"
            }`}
            title="Toggle push notifications"
          >
            <span className="flex items-center">
              <BellRing className="mr-2 h-4 w-4" />
              {notificationEnabled ? "Disable Notifications" : "Enable Notifications"}
            </span>
          </Button>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-gray-600 dark:text-gray-300">Intensity</span>
              <span className="font-semibold text-sky-700 dark:text-sky-300">{notificationIntensity}%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[notificationIntensity]}
              onValueChange={(value) => setLocalIntensity(value[0] ?? 0)}
              onValueCommit={(value) => void saveIntensity(value[0] ?? 0)}
              disabled={notificationLoading}
              aria-label="Notification intensity"
            />
            <p className="text-[11px] text-gray-600 dark:text-gray-400">Status: {notificationStatusLabel}</p>
          </div>
        </div>

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
          <Link href="/account">
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-sm truncate transition-colors cursor-pointer",
                "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary",
                isActiveRoute("/account") && "bg-gray-100 dark:bg-gray-700 text-primary",
              )}
              onClick={handleNavClick}
              role="link"
              title="Account — email and profile"
              aria-label={`Open account for ${user.displayName || user.email}`}
            >
              <AccountUserAvatar user={user} className="h-8 w-8 text-xs" />
              <span className="truncate min-w-0">{user.displayName || user.email}</span>
            </div>
          </Link>
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
        <InstallShortcutButton />
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await logout();
            handleNavClick();
          }}
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
  const { user } = useAuth();
  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onMenuOpen} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="text-lg font-bold text-primary flex items-center">
        <CheckSquare className="mr-2 h-5 w-5" />
        AxTask
      </h1>
      {user ? (
        <Link
          href="/account"
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-full overflow-hidden shrink-0",
            "text-sm font-medium hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
          )}
          aria-label={`Account — ${user.displayName || user.email}`}
          title="Account"
        >
          <AccountUserAvatar user={user} className="h-9 w-9 text-xs" />
        </Link>
      ) : (
        <div className="w-10" />
      )}
    </div>
  );
}

export function Sidebar() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarWidthPx, isNavFocus, toggleSidebarHidden } = useImmersiveShell();

  useEffect(() => {
    /** Ctrl/Cmd+Shift+B is reserved for bookmarks in many browsers; use Backslash instead. */
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Backslash") {
        e.preventDefault();
        if (isMobile) {
          setMobileOpen((v) => !v);
        } else {
          toggleSidebarHidden();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, toggleSidebarHidden]);

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
      </>
    );
  }

  return (
    <>
      <aside
        className={cn(
          "bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200 dark:border-gray-700 flex-col shrink-0 hidden md:flex transition-[width,box-shadow] duration-200 overflow-hidden min-h-0 outline-none",
          sidebarWidthPx === 0 && "border-r-0 shadow-none",
          isNavFocus && "ring-2 ring-primary/35 shadow-2xl z-10",
        )}
        style={{ width: sidebarWidthPx }}
      >
        {sidebarWidthPx > 0 ? <SidebarContent /> : null}
      </aside>
      {sidebarWidthPx === 0 ? <PretextPeekStrip /> : null}
      {sidebarWidthPx > 0 ? <ShellSplitter /> : null}
    </>
  );
}
