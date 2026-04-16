export type ReminderPolicy = {
  enabled: boolean;
  intensity: number;
  cadenceMinutes: number | null;
  maxPerDay: number;
};

type BridgeLike = {
  applyReminderPolicy?: (policy: ReminderPolicy) => Promise<void> | void;
};

declare global {
  interface Window {
    AndroidReminderBridge?: BridgeLike;
    WindowsReminderBridge?: BridgeLike;
  }
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

function isWindows(): boolean {
  return /windows/i.test(navigator.userAgent);
}

export async function applyNativeReminderPolicy(policy: ReminderPolicy): Promise<void> {
  const androidEnabled = import.meta.env.VITE_ENABLE_ANDROID_REMINDERS === "true";
  const windowsEnabled = import.meta.env.VITE_ENABLE_WINDOWS_REMINDERS === "true";

  if (androidEnabled && isAndroid() && window.AndroidReminderBridge?.applyReminderPolicy) {
    await window.AndroidReminderBridge.applyReminderPolicy(policy);
  }
  if (windowsEnabled && isWindows() && window.WindowsReminderBridge?.applyReminderPolicy) {
    await window.WindowsReminderBridge.applyReminderPolicy(policy);
  }
}

