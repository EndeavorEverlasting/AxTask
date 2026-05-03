import type { ArchetypeKey } from "./avatar-archetypes";

/**
 * Public DTO for GET /api/gamification/avatars `archetypeContinuum`.
 * Weights are nonnegative and sum to 1.0; `milli` integers sum to 100_000.
 */
export type ArchetypeContinuumDto = {
  milli: Record<ArchetypeKey, number>;
  weights: Record<ArchetypeKey, number>;
  dominantArchetype: ArchetypeKey;
};
