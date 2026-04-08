/**
 * In-app immersive sound tiers vs notification intensity (0–100).
 * Tier 1 = highest importance (rewards, badges); tier 3 = low-stakes confirmations.
 */

export type ImmersiveSoundTier = 1 | 2 | 3;

export function clampImmersiveIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Stochastic gate: returns whether a one-shot sound should play for this event.
 * - Tier 3 never plays at intensity ≤ 50.
 * - Tier 1 keeps a decent floor when intensity is low.
 * - Tier 2 sits between; tier 3 ramps up sharply only at high intensity.
 */
export function shouldPlayImmersiveSound(
  intensityInput: number,
  tier: ImmersiveSoundTier,
  random01: number,
): boolean {
  const intensity = clampImmersiveIntensity(intensityInput);
  if (intensity <= 0) return false;
  const r = Math.max(0, Math.min(1, random01));

  if (tier === 3 && intensity <= 50) return false;

  if (tier === 1) {
    const p = 0.45 + 0.55 * (intensity / 100);
    return r < p;
  }

  if (tier === 2) {
    if (intensity <= 50) {
      const p = 0.08 + 0.32 * (intensity / 50);
      return r < p;
    }
    const p = 0.4 + 0.55 * ((intensity - 50) / 50);
    return r < p;
  }

  const t = intensity > 50 ? (intensity - 50) / 50 : 0;
  const p = 0.12 * t * t;
  return r < p;
}
