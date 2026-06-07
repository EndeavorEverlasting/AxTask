import { useEffect, useState } from "react";

export type AdminPollTab =
  | "live"
  | "usage"
  | "storage"
  | "performance"
  | "intel"
  | "feedback"
  | "appeals"
  | "invoices"
  | "users"
  | "logs"
  | "migration"
  | "engineering";

type Options = {
  activeTab: AdminPollTab;
  pollTab: AdminPollTab | AdminPollTab[];
  commandCenterMode?: boolean;
  /** Default 60_000; Command Center uses 15_000 */
  fastIntervalMs?: number;
  slowIntervalMs?: number;
};

function tabMatches(activeTab: AdminPollTab, pollTab: AdminPollTab | AdminPollTab[]): boolean {
  return Array.isArray(pollTab) ? pollTab.includes(activeTab) : activeTab === pollTab;
}

/**
 * Admin live polling: off when tab hidden/unfocused unless Command Center (fast interval).
 */
export function useAdminLivePolling(options: Options): false | number {
  const {
    activeTab,
    pollTab,
    commandCenterMode = false,
    fastIntervalMs = 15_000,
    slowIntervalMs = 60_000,
  } = options;

  const [focused, setFocused] = useState(
    typeof document !== "undefined" ? document.hasFocus() : true,
  );
  const [visible, setVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );

  useEffect(() => {
    const onFocus = () => setFocused(document.hasFocus());
    const onVis = () => setVisible(document.visibilityState === "visible");
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!tabMatches(activeTab, pollTab)) return false;
  if (!focused || !visible) return false;
  if (commandCenterMode) return fastIntervalMs;
  return slowIntervalMs;
}
