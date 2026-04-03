import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type NotificationPreference = {
  userId: string;
  enabled: boolean;
  intensity: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type PushSupportStatus = "unsupported" | "denied" | "default" | "granted";

type NotificationModeContextValue = {
  isLoading: boolean;
  enabled: boolean;
  intensity: number;
  pushStatus: PushSupportStatus;
  canUsePush: boolean;
  toggleNotificationMode: () => Promise<void>;
  setLocalIntensity: (value: number) => void;
  saveIntensity: (value: number) => Promise<void>;
};

const NotificationModeContext = createContext<NotificationModeContextValue | null>(null);

function clampIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toPushStatus(): PushSupportStatus {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "granted";
  return "default";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function patchPreferences(payload: Partial<Pick<NotificationPreference, "enabled" | "intensity">>) {
  const res = await apiRequest("PATCH", "/api/notifications/preferences", payload);
  return res.json();
}

export function NotificationModeProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [localIntensity, setLocalIntensity] = useState<number>(50);
  const [pushStatus, setPushStatus] = useState<PushSupportStatus>(() => toPushStatus());

  const preferenceQuery = useQuery<NotificationPreference>({
    queryKey: ["/api/notifications/preferences"],
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!preferenceQuery.data) return;
    setLocalIntensity(clampIntensity(preferenceQuery.data.intensity));
  }, [preferenceQuery.data]);

  useEffect(() => {
    setPushStatus(toPushStatus());
  }, []);

  const savePreferenceMutation = useMutation({
    mutationFn: patchPreferences,
    onSuccess: (next) => {
      preferenceQuery.refetch();
      setLocalIntensity(clampIntensity(next.intensity));
    },
  });

  const upsertSubscriptionMutation = useMutation({
    mutationFn: async (subscription: PushSubscription) => {
      const json = subscription.toJSON();
      const payload = {
        endpoint: subscription.endpoint,
        expirationTime: json.expirationTime ?? null,
        keys: {
          p256dh: json.keys?.p256dh || "",
          auth: json.keys?.auth || "",
        },
      };
      await apiRequest("POST", "/api/notifications/subscriptions", payload);
    },
  });

  const deleteSubscriptionMutation = useMutation({
    mutationFn: async (endpoint: string) => {
      await apiRequest("DELETE", "/api/notifications/subscriptions", { endpoint });
    },
  });

  const ensureSubscription = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim();
    if (!vapidPublicKey) {
      toast({
        title: "Push key missing",
        description: "VAPID public key is not configured, so browser push is unavailable.",
        variant: "destructive",
      });
      throw new Error("VAPID public key not configured");
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    await upsertSubscriptionMutation.mutateAsync(subscription);
  }, [toast, upsertSubscriptionMutation]);

  const disableAndUnsubscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return;
    try {
      await deleteSubscriptionMutation.mutateAsync(sub.endpoint);
    } finally {
      await sub.unsubscribe();
    }
  }, [deleteSubscriptionMutation]);

  const toggleNotificationMode = useCallback(async () => {
    const currentlyEnabled = Boolean(preferenceQuery.data?.enabled);

    if (currentlyEnabled) {
      await disableAndUnsubscribe();
      await savePreferenceMutation.mutateAsync({ enabled: false });
      toast({ title: "Notifications off", description: "Notification mode has been disabled." });
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushStatus("unsupported");
      toast({
        title: "Push not supported",
        description: "This browser does not support push notifications.",
        variant: "destructive",
      });
      return;
    }

    let permission = Notification.permission;
    if (permission !== "granted") {
      permission = await Notification.requestPermission();
    }
    setPushStatus(permission as PushSupportStatus);

    if (permission !== "granted") {
      toast({
        title: "Push permission denied",
        description: "Allow browser notifications to enable notification mode.",
        variant: "destructive",
      });
      return;
    }

    await ensureSubscription();
    await savePreferenceMutation.mutateAsync({ enabled: true });
    toast({ title: "Notifications on", description: "Push notifications are now enabled." });
  }, [disableAndUnsubscribe, ensureSubscription, preferenceQuery.data?.enabled, savePreferenceMutation, toast]);

  const saveIntensity = useCallback(async (value: number) => {
    const intensity = clampIntensity(value);
    setLocalIntensity(intensity);
    await savePreferenceMutation.mutateAsync({ intensity });
  }, [savePreferenceMutation]);

  useEffect(() => {
    const run = async () => {
      if (!preferenceQuery.data?.enabled) return;
      if (toPushStatus() !== "granted") return;
      try {
        await ensureSubscription();
      } catch {
        // ignore background sync errors; toggle flow surfaces user-facing errors.
      }
    };
    run();
  }, [ensureSubscription, preferenceQuery.data?.enabled]);

  const value = useMemo<NotificationModeContextValue>(() => ({
    isLoading: preferenceQuery.isLoading,
    enabled: Boolean(preferenceQuery.data?.enabled),
    intensity: localIntensity,
    pushStatus,
    canUsePush: pushStatus !== "unsupported" && pushStatus !== "denied",
    toggleNotificationMode,
    setLocalIntensity: (value: number) => setLocalIntensity(clampIntensity(value)),
    saveIntensity,
  }), [localIntensity, preferenceQuery.data?.enabled, preferenceQuery.isLoading, pushStatus, saveIntensity, toggleNotificationMode]);

  return (
    <NotificationModeContext.Provider value={value}>
      {children}
    </NotificationModeContext.Provider>
  );
}

export function useNotificationMode() {
  const ctx = useContext(NotificationModeContext);
  if (!ctx) throw new Error("useNotificationMode must be used within NotificationModeProvider");
  return ctx;
}
