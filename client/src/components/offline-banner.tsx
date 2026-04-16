import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[60] border-b border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950 dark:border-orange-900/60 dark:bg-orange-950/60 dark:text-orange-100"
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">
          You&apos;re offline — changes will sync when you reconnect.
        </span>
      </div>
    </div>
  );
}

