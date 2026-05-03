/**
 * Canonical mapping from a companion `avatarKey` to the analytical
 * `archetypeKey` used by archetype-level analytics (empathy continuum,
 * Markov transitions, RAG enrichment).
 *
 * Source of truth: `DEFAULT_AVATAR_PROFILES` in `server/storage.ts`. This
 * shared module mirrors that mapping so both client and server can resolve
 * archetypes without importing server code. A contract test asserts that the
 * two stay aligned.
 *
 * See docs/ARCHETYPE_EMPATHY_ANALYTICS.md for the full taxonomy + privacy
 * guarantees. Only the archetype key (never userId, never raw avatar labels)
 * is exposed on public read APIs.
 */

import type { FeedbackAvatarKey } from "./feedback-avatar-map";

export const ARCHETYPE_KEYS = [
  "momentum",
  "strategy",
  "execution",
  "collaboration",
  "recovery",
] as const;

export type ArchetypeKey = (typeof ARCHETYPE_KEYS)[number];

export const AVATAR_TO_ARCHETYPE: Readonly<Record<FeedbackAvatarKey, ArchetypeKey>> =
  Object.freeze({
    mood: "momentum",
    archetype: "strategy",
    productivity: "execution",
    social: "collaboration",
    lazy: "recovery",
  });

export function isArchetypeKey(value: unknown): value is ArchetypeKey {
  return typeof value === "string" && (ARCHETYPE_KEYS as readonly string[]).includes(value);
}

export function archetypeFromAvatar(avatarKey: FeedbackAvatarKey | null | undefined): ArchetypeKey | null {
  if (!avatarKey) return null;
  return AVATAR_TO_ARCHETYPE[avatarKey] ?? null;
}
