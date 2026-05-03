export type ImmersiveSoundsScope = "account" | "local";

export type ImmersiveSoundsDevicePrefs = {
  scope: ImmersiveSoundsScope;
  /** When scope is "local", this controls playback on this device. */
  enabledLocal: boolean;
};

const STORAGE_KEY = "axtask.immersive-sounds";

const DEFAULT_PREFS: ImmersiveSoundsDevicePrefs = {
  scope: "account",
  enabledLocal: false,
};

export function readImmersiveSoundsDevicePrefs(): ImmersiveSoundsDevicePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const j = JSON.parse(raw) as Partial<ImmersiveSoundsDevicePrefs>;
    const scope = j.scope === "local" ? "local" : "account";
    return {
      scope,
      enabledLocal: typeof j.enabledLocal === "boolean" ? j.enabledLocal : false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeImmersiveSoundsDevicePrefs(patch: Partial<ImmersiveSoundsDevicePrefs>): ImmersiveSoundsDevicePrefs {
  const cur = readImmersiveSoundsDevicePrefs();
  const next: ImmersiveSoundsDevicePrefs = { ...cur, ...patch };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}
