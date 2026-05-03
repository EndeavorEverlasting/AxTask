const DEVICE_STATE_KEY = "axtask.install.device.v2";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type DeviceInstallState = {
  dismissedUntil?: number;
  optOut?: boolean;
  installed?: boolean;
};

export function readInstallDeviceState(): DeviceInstallState {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(DEVICE_STATE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DeviceInstallState;
  } catch {
    return {};
  }
}

export function writeInstallDeviceState(partial: Partial<DeviceInstallState>): void {
  if (typeof localStorage === "undefined") return;
  try {
    const next = { ...readInstallDeviceState(), ...partial };
    localStorage.setItem(DEVICE_STATE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function markInstallDismissed(): void {
  writeInstallDeviceState({ dismissedUntil: Date.now() + DISMISS_TTL_MS });
}

export function shouldSuppressInstallPrompt(): boolean {
  const st = readInstallDeviceState();
  if (st.optOut || st.installed) return true;
  if (typeof st.dismissedUntil === "number" && st.dismissedUntil > Date.now()) return true;
  return false;
}

