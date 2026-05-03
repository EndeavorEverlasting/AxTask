/**
 * Matches `selectDominantAvatarProfile` in server/storage.ts so the voice bar
 * highlights the same companion that receives voice-triggered XP grants.
 */
export function selectDominantAvatarProfile<T extends { totalXp: number; avatarKey: string }>(
  profiles: readonly T[],
): T | null {
  if (profiles.length === 0) return null;
  let best = profiles[0]!;
  for (let i = 1; i < profiles.length; i++) {
    const p = profiles[i]!;
    if (p.totalXp > best.totalXp) best = p;
    else if (p.totalXp === best.totalXp && p.avatarKey.localeCompare(best.avatarKey) < 0) best = p;
  }
  return best;
}
