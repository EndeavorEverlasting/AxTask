import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { applyNativeReminderPolicy } from "@/lib/native-reminder-bridge";
import {
  writeFeedbackPrefsCache,
  type FeedbackNudgePrefsCache,
} from "@/lib/feedback-nudge";

type NotificationPreference = {
  userId: string;
  enabled: boolean;
  intensity: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  immersiveSoundsEnabled: boolean;
  feedbackNudgePrefs?: FeedbackNudgePrefsCache;
  createdAt: string | Date;
  updatedAt: string | Date;
  pushConfigured?: boolean;
  hasSubscription?: boolean;
  deliveryChannel?: "push" | "in_app";
  dispatchProfile?: {
    intensity: number;
    band: "off" | "low" | "balanced" | "frequent";
    cadenceMinutes: number | null;
    maxPerDay: number;
    feedbackCooldownSeconds: number | null;
    feedbackMaxPerDay: number;
  };
};

type PushSupportStatus = "unsupported" | "denied" | "default" | "granted";

type NotificationModeContextValue = {
  isLoading: boolean;
  enabled: boolean;
  intensity: number;
  immersiveSoundsEnabled: boolean;
  feedbackNudgePrefs: FeedbackNudgePrefsCache;
  pushStatus: PushSupportStatus;
  canUsePush: boolean;
  dispatchProfile?: NotificationPreference["dispatchProfile"];
  deliveryChannel?: NotificationPreference["deliveryChannel"];
  toggleNotificationMode: () => Promise<void>;
  setLocalIntensity: (value: number) => void;
  saveIntensity: (value: number) => Promise<void>;
  saveNotificationPreferences: (
    payload: Partial<
      Pick<NotificationPreference, "enabled" | "intensity" | "immersiveSoundsEnabled" | "feedbackNudgePrefs">
    >,
  ) => Promise<void>;
  saveFeedbackNudgePrefs: (prefs: Partial<FeedbackNudgePrefsCache>) => Promise<void>;
};

const NotificationModeContext = createContext<NotificationModeContextValue | null>(null);

function clampIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function persistClientReminderState(enabled: boolean, intensity: number): void {
  try {
    localStorage.setItem("axtask.notification.enabled", String(enabled));
    localStorage.setItem("axtask.notification.intensity", String(intensity));
  } catch {
    // ignore storage quota/private mode
  }
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

async function patchPreferences(
  payload: Partial<
    Pick<NotificationPreference, "enabled" | "intensity" | "immersiveSoundsEnabled" | "feedbackNudgePrefs">
  >,
) {
  const res = await apiRequest("PATCH", "/api/notifications/preferences", payload);
  return res.json();
}

async function resolveVapidPublicKey(): Promise<string | null> {
  const envKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim();
  if (envKey) return envKey;
  try {
    const res = await fetch("/api/notifications/push-public-config", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { configured?: boolean; publicKey?: string };
    if (data.configured && data.publicKey?.trim()) return data.publicKey.trim();
  } catch {
    return null;
  }
  return null;
}

function canUsePushApis(): boolean {
  return "Notification" in window && "serviceWorker" in navigator;
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
    persistClientReminderState(Boolean(preferenceQuery.data.enabled), clampIntensity(preferenceQuery.data.intensity));
    if (preferenceQuery.data.feedbackNudgePrefs) {
      writeFeedbackPrefsCache(preferenceQuery.data.feedbackNudgePrefs);
    }
  }, [preferenceQuery.data]);

  useEffect(() => {
    setPushStatus(toPushStatus());
  }, []);

  const savePreferenceMutation = useMutation({
    mutationFn: patchPreferences,
    onSuccess: (next) => {
      preferenceQuery.refetch();
      setLocalIntensity(clampIntensity(next.intensity));
      persistClientReminderState(Boolean(next.enabled), clampIntensity(next.intensity));
      if (next.feedbackNudgePrefs) {
        writeFeedbackPrefsCache(next.feedbackNudgePrefs);
      }
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
    if (!("serviceWorker" in navigator)) return false;
    const vapidPublicKey = await resolveVapidPublicKey();
    if (!vapidPublicKey) return false;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
    await upsertSubscriptionMutation.mutateAsync(subscription);
    return true;
  }, [upsertSubscriptionMutation]);

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
      const nextPref = await savePreferenceMutation.mutateAsync({ enabled: false });
      const dispatchProfile = nextPref.dispatchProfile;
      await applyNativeReminderPolicy({
        enabled: false,
        intensity: nextPref.intensity ?? localIntensity,
        cadenceMinutes: dispatchProfile?.cadenceMinutes ?? null,
        maxPerDay: dispatchProfile?.maxPerDay ?? 0,
      });
      toast({ title: "Notifications off", description: "Notification mode has been disabled." });
      return;
    }

    let pushEnabled = false;
    if (canUsePushApis()) {
      const vapidPublicKey = await resolveVapidPublicKey();
      if (vapidPublicKey) {
        let permission = Notification.permission;
        if (permission !== "granted") {
          permission = await Notification.requestPermission();
        }
        setPushStatus(permission as PushSupportStatus);
        if (permission === "granted") {
          pushEnabled = await ensureSubscription();
        }
      } else {
        setPushStatus(toPushStatus());
      }
    } else {
      setPushStatus("unsupported");
    }

    const nextPref = await savePreferenceMutation.mutateAsync({ enabled: true });
    const dispatchProfile = nextPref.dispatchProfile;
    await applyNativeReminderPolicy({
      enabled: true,
      intensity: nextPref.intensity ?? localIntensity,
      cadenceMinutes: dispatchProfile?.cadenceMinutes ?? null,
      maxPerDay: dispatchProfile?.maxPerDay ?? 0,
    });
    if (pushEnabled) {
      toast({ title: "Notifications on", description: "Push notifications are now enabled." });
    } else {
      toast({
        title: "Notifications on",
        description: "Notification mode is enabled. Push delivery is unavailable on this device/configuration.",
      });
    }
  }, [
    disableAndUnsubscribe,
    ensureSubscription,
    localIntensity,
    preferenceQuery.data?.enabled,
    savePreferenceMutation,
    toast,
  ]);

  const saveIntensity = useCallback(async (value: number) => {
    const intensity = clampIntensity(value);
    setLocalIntensity(intensity);
    const nextPref = await savePreferenceMutation.mutateAsync({ intensity });
    const profile = nextPref.dispatchProfile;
    await applyNativeReminderPolicy({
      enabled: Boolean(nextPref.enabled),
      intensity,
      cadenceMinutes: profile?.cadenceMinutes ?? null,
      maxPerDay: profile?.maxPerDay ?? 0,
    });
    persistClientReminderState(Boolean(nextPref.enabled), intensity);
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

  const saveNotificationPreferences = useCallback(async (
    payload: Partial<
      Pick<NotificationPreference, "enabled" | "intensity" | "immersiveSoundsEnabled" | "feedbackNudgePrefs">
    >,
  ) => {
    await savePreferenceMutation.mutateAsync(payload);
  }, [savePreferenceMutation]);

  const saveFeedbackNudgePrefs = useCallback(
    async (prefs: Partial<FeedbackNudgePrefsCache>) => {
      /* Write-through: cache immediately, then persist to server. */
      const current: FeedbackNudgePrefsCache = preferenceQuery.data?.feedbackNudgePrefs ?? {
        master: 50,
        byAvatar: {},
      };
      const merged: FeedbackNudgePrefsCache = {
        master: clampIntensity(prefs.master ?? current.master ?? 50),
        byAvatar: { ...current.byAvatar, ...(prefs.byAvatar ?? {}) },
      };
      writeFeedbackPrefsCache(merged);
      await savePreferenceMutation.mutateAsync({ feedbackNudgePrefs: merged });
    },
    [preferenceQuery.data?.feedbackNudgePrefs, savePreferenceMutation],
  );

  const value = useMemo<NotificationModeContextValue>(() => ({
    isLoading: preferenceQuery.isLoading,
    enabled: Boolean(preferenceQuery.data?.enabled),
    intensity: localIntensity,
    immersiveSoundsEnabled: Boolean(preferenceQuery.data?.immersiveSoundsEnabled),
    feedbackNudgePrefs: preferenceQuery.data?.feedbackNudgePrefs ?? { master: 50, byAvatar: {} },
    pushStatus,
    canUsePush: pushStatus !== "unsupported" && pushStatus !== "denied",
    dispatchProfile: preferenceQuery.data?.dispatchProfile,
    deliveryChannel: preferenceQuery.data?.deliveryChannel,
    toggleNotificationMode,
    setLocalIntensity: (value: number) => setLocalIntensity(clampIntensity(value)),
    saveIntensity,
    saveNotificationPreferences,
    saveFeedbackNudgePrefs,
  }), [
    localIntensity,
    preferenceQuery.data?.enabled,
    preferenceQuery.data?.dispatchProfile,
    preferenceQuery.data?.deliveryChannel,
    preferenceQuery.data?.feedbackNudgePrefs,
    preferenceQuery.data?.immersiveSoundsEnabled,
    preferenceQuery.isLoading,
    pushStatus,
    saveIntensity,
    saveNotificationPreferences,
    saveFeedbackNudgePrefs,
    toggleNotificationMode,
  ]);

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
