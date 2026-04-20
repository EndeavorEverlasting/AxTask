/**
 * Dominant analytical archetype for poll bucketing: pick the companion profile
 * with highest totalXp; tie-break by lexicographically smallest avatarKey so the
 * choice is stable across calls.
 */
import type { ArchetypeKey } from "@shared/avatar-archetypes";
import { isArchetypeKey } from "@shared/avatar-archetypes";
import type { UserAvatarProfile } from "@shared/schema";

export function dominantArchetypeFromAvatarProfiles(
  profiles: UserAvatarProfile[],
): ArchetypeKey | null {
  if (profiles.length === 0) return null;
  let best = profiles[0];
  for (let i = 1; i < profiles.length; i++) {
    const p = profiles[i];
    if (p.totalXp > best.totalXp) {
      best = p;
    } else if (p.totalXp === best.totalXp) {
      if (p.avatarKey < best.avatarKey) best = p;
    }
  }
  return isArchetypeKey(best.archetypeKey) ? best.archetypeKey : null;
}
