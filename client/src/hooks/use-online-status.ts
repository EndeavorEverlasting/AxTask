import { useEffect, useState } from "react";

function resolveInitialOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  if (typeof navigator.onLine !== "boolean") return true;
  return navigator.onLine;
}

export function useOnlineStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(() => resolveInitialOnline());

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // In case state changed before listeners were attached.
    setIsOnline(resolveInitialOnline());

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { isOnline };
}

