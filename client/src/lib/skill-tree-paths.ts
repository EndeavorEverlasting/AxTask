/**
 * REST paths for the two gamification skill trees (avatar vs idle/offline).
 * Used by unlock mutations and TanStack Query invalidation.
 */
export type SkillTreeKind = "avatar" | "offline";

export function gamificationSkillTreeApiPaths(tree: SkillTreeKind): {
  list: string;
  unlock: string;
} {
  return tree === "avatar"
    ? { list: "/api/gamification/avatar-skills", unlock: "/api/gamification/avatar-skills/unlock" }
    : { list: "/api/gamification/offline-skills", unlock: "/api/gamification/offline-skills/unlock" };
}
