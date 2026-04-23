export type ReminderPolicy = {
  enabled: boolean;
  intensity: number;
  cadenceMinutes: number | null;
  maxPerDay: number;
};

type BridgeLike = {
  applyReminderPolicy?: (policy: ReminderPolicy) => Promise<void> | void;
};

type AlarmBridgeLike = {
  /** Restore alarms from JSON captured by `/api/alarm-snapshots` (shell implements parsing). */
  applyAlarmSnapshot?: (payloadJson: string) => Promise<void> | void;
};

declare global {
  interface Window {
    AndroidReminderBridge?: BridgeLike;
    WindowsReminderBridge?: BridgeLike;
    AndroidAlarmBridge?: AlarmBridgeLike;
    WindowsAlarmBridge?: AlarmBridgeLike;
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

/** Returns true when a native alarm bridge actually ran (not a no-op). */
export async function applyNativeAlarmSnapshotPayload(payloadJson: string): Promise<boolean> {
  const androidEnabled = import.meta.env.VITE_ENABLE_ANDROID_REMINDERS === "true";
  const windowsEnabled = import.meta.env.VITE_ENABLE_WINDOWS_REMINDERS === "true";
  let applied = false;
  if (androidEnabled && isAndroid() && window.AndroidAlarmBridge?.applyAlarmSnapshot) {
    await window.AndroidAlarmBridge.applyAlarmSnapshot(payloadJson);
    applied = true;
  }
  if (windowsEnabled && isWindows() && window.WindowsAlarmBridge?.applyAlarmSnapshot) {
    await window.WindowsAlarmBridge.applyAlarmSnapshot(payloadJson);
    applied = true;
  }
  return applied;
}

