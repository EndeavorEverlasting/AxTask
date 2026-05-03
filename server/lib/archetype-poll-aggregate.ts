import type { ArchetypeKey } from "@shared/avatar-archetypes";
import { ARCHETYPE_KEYS } from "@shared/avatar-archetypes";

/** Matches empathy read APIs (`ARCHETYPE_K_ANON_THRESHOLD` in routes). */
export const ARCHETYPE_POLL_K_ANON_THRESHOLD = 5;

export type RawOptionTally = {
  optionId: string;
  label: string;
  sortOrder: number;
  /** archetypeKey -> count */
  countsByArchetype: Map<string, number>;
  totalCount: number;
};

export type PublicOptionTally = {
  optionId: string;
  label: string;
  sortOrder: number;
  totalCount: number;
  byArchetype: Partial<Record<ArchetypeKey, number>>;
};

/**
 * Drops per-archetype cells below k; omits archetype keys entirely when
 * suppressed (callers should not display zero as real zeros).
 */
export function applyKAnonymityToPollTallies(
  raw: RawOptionTally[],
  k: number = ARCHETYPE_POLL_K_ANON_THRESHOLD,
): PublicOptionTally[] {
  return raw.map((row) => {
    const byArchetype: Partial<Record<ArchetypeKey, number>> = {};
    for (const key of ARCHETYPE_KEYS) {
      const c = row.countsByArchetype.get(key) ?? 0;
      if (c >= k) byArchetype[key] = c;
    }
    return {
      optionId: row.optionId,
      label: row.label,
      sortOrder: row.sortOrder,
      totalCount: row.totalCount,
      byArchetype,
    };
  });
}
