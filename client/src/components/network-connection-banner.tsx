import { Wifi, Smartphone } from "lucide-react";
import { useNetworkConnection } from "@/hooks/use-network-connection";

export function NetworkConnectionBanner() {
  const status = useNetworkConnection();

  if (!status.isOnline || !status.shouldWarn) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[61] border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/70 dark:text-amber-100"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">
          {status.warningMessage ?? "You may be using mobile data. Reconnect to Wi-Fi to avoid data usage."}
        </span>
        <Wifi className="hidden h-4 w-4 shrink-0 opacity-70 sm:block" aria-hidden />
      </div>
    </div>
  );
}
