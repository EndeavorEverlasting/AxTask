import { useCallback, useMemo, useState } from "react";
import {
  readImmersiveSoundsDevicePrefs,
  writeImmersiveSoundsDevicePrefs,
  type ImmersiveSoundsDevicePrefs,
  type ImmersiveSoundsScope,
} from "@/lib/immersive-sounds-storage";
import { useNotificationMode } from "@/hooks/use-notification-mode";
import { shouldPlayImmersiveSound, type ImmersiveSoundTier } from "@shared/immersive-sounds";

/** Placeholder WAVs in `client/public/sounds/` — swap for final assets without code changes. */
const TIER_SOUND_URL: Record<ImmersiveSoundTier, string> = {
  1: "/sounds/tier-1.wav",
  2: "/sounds/tier-2.wav",
  3: "/sounds/tier-3.wav",
};

export function useImmersiveSounds() {
  const { intensity, immersiveSoundsEnabled, saveNotificationPreferences } = useNotificationMode();
  const [devicePrefs, setDevicePrefs] = useState<ImmersiveSoundsDevicePrefs>(() => readImmersiveSoundsDevicePrefs());

  const refreshDevicePrefs = useCallback(() => {
    setDevicePrefs(readImmersiveSoundsDevicePrefs());
  }, []);

  const effectiveEnabled = useMemo(() => {
    if (devicePrefs.scope === "local") return devicePrefs.enabledLocal;
    return immersiveSoundsEnabled;
  }, [devicePrefs.enabledLocal, devicePrefs.scope, immersiveSoundsEnabled]);

  const setSoundsEnabled = useCallback(
    async (next: boolean) => {
      if (devicePrefs.scope === "local") {
        writeImmersiveSoundsDevicePrefs({ enabledLocal: next });
        refreshDevicePrefs();
        return;
      }
      await saveNotificationPreferences({ immersiveSoundsEnabled: next });
    },
    [devicePrefs.scope, refreshDevicePrefs, saveNotificationPreferences],
  );

  const setScope = useCallback(
    async (nextScope: ImmersiveSoundsScope) => {
      if (nextScope === devicePrefs.scope) return;

      if (nextScope === "account") {
        const effective =
          devicePrefs.scope === "local" ? devicePrefs.enabledLocal : immersiveSoundsEnabled;
        writeImmersiveSoundsDevicePrefs({
          scope: "account",
          enabledLocal: devicePrefs.enabledLocal,
        });
        refreshDevicePrefs();
        await saveNotificationPreferences({ immersiveSoundsEnabled: effective });
        return;
      }

      writeImmersiveSoundsDevicePrefs({
        scope: "local",
        enabledLocal: immersiveSoundsEnabled,
      });
      refreshDevicePrefs();
    },
    [
      devicePrefs.enabledLocal,
      devicePrefs.scope,
      immersiveSoundsEnabled,
      refreshDevicePrefs,
      saveNotificationPreferences,
    ],
  );

  const playIfEligible = useCallback(
    (tier: ImmersiveSoundTier) => {
      if (!effectiveEnabled) return;
      if (!shouldPlayImmersiveSound(intensity, tier, Math.random())) return;
      try {
        const audio = new Audio(TIER_SOUND_URL[tier]);
        audio.volume = 0.35;
        void audio.play().catch(() => undefined);
      } catch {
        /* ignore */
      }
    },
    [effectiveEnabled, intensity],
  );

  /** Account settings: always plays tier-1 sample when sounds are on (ignores intensity gate). */
  const playPreview = useCallback(() => {
    if (!effectiveEnabled) return;
    try {
      const audio = new Audio(TIER_SOUND_URL[1]);
      audio.volume = 0.35;
      void audio.play().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }, [effectiveEnabled]);

  return {
    deviceScope: devicePrefs.scope,
    effectiveEnabled,
    setSoundsEnabled,
    setScope,
    refreshDevicePrefs,
    playIfEligible,
    playPreview,
  };
}
