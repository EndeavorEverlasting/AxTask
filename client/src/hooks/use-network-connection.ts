import { useEffect, useState } from "react";
import {
  classifyNetworkConnection,
  getBrowserNetworkConnection,
  type NetworkConnectionStatus,
} from "@/lib/network-connection";

function resolveNetworkConnection(): NetworkConnectionStatus {
  const isOnline = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  return classifyNetworkConnection({
    isOnline,
    connection: getBrowserNetworkConnection(),
  });
}

export function useNetworkConnection(): NetworkConnectionStatus {
  const [status, setStatus] = useState<NetworkConnectionStatus>(() => resolveNetworkConnection());

  useEffect(() => {
    const connection = getBrowserNetworkConnection();
    const refresh = () => setStatus(resolveNetworkConnection());

    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    connection?.addEventListener?.("change", refresh);

    refresh();

    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      connection?.removeEventListener?.("change", refresh);
    };
  }, []);

  return status;
}
