import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth-context";
import { useZoom } from "@/hooks/use-zoom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sun, Moon, ZoomIn, ZoomOut, LogOut, User, Monitor } from "lucide-react";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { zoom, zoomIn, zoomOut, resetZoom, ZOOM_MIN, ZOOM_MAX } = useZoom();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">Manage your appearance and account preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base">
            <Monitor className="mr-2 h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>Control how AxTask looks on your screen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Theme</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Switch between light and dark mode</div>
            </div>
            <Button variant="outline" size="sm" onClick={toggleTheme} className="min-w-[120px]">
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
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Zoom</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Adjust the display scale of the app (desktop only)</div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <button
                onClick={resetZoom}
                className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary transition-colors min-w-[4rem] text-center"
              >
                {zoom}%
              </button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={resetZoom} className="text-xs text-gray-500">
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base">
            <User className="mr-2 h-5 w-5" />
            Account
          </CardTitle>
          <CardDescription>Your profile and session management.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="" className="h-8 w-8 rounded-full shrink-0" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-gray-500" />
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user.displayName || user.email}
                </div>
                {user.email && user.displayName && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                )}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
