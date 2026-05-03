export type ImmersiveSoundTier = 1 | 2 | 3;

/**
 * Whether an immersive sound should play for this tier given notification intensity (0–100) and roll in [0,1).
 */
export function shouldPlayImmersiveSound(
  intensity: number,
  _tier: ImmersiveSoundTier,
  roll: number,
): boolean {
  const clamped = Math.max(0, Math.min(100, intensity));
  const threshold = Math.min(0.95, 0.15 + clamped / 120);
  return roll < threshold;
}
