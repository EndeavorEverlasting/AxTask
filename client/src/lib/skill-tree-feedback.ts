import {
  DEFAULT_FEEDBACK_SOURCE_TO_AVATAR,
  type FeedbackAvatarKey,
  getAvatarForSource,
} from "@shared/feedback-avatar-map";

import type { SkillTreeKind } from "./skill-tree-paths";

export type { SkillTreeKind };

/**
 * Matches the `source` strings emitted by `resolveSkillUnlockSource`.
 * The feedback-nudge dialog uses this to swap in skill-tree-themed openers.
 */
export const SKILL_TREE_SOURCE_RE = /^(avatar|offline)_skill_(unlock|branch|tree)/;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, "_");
}

/**
 * Layered skill-unlock source resolution.
 *
 * Returns the most specific `source` string present in
 * `DEFAULT_FEEDBACK_SOURCE_TO_AVATAR`, in the order:
 *   1. `{tree}_skill_unlock_{skill_key}`  specialized node persona
 *   2. `{tree}_skill_branch_{branch}`      branch-wide persona
 *   3. `{tree}_skill_tree`                  tree-wide persona
 *
 * The tree-wide entry is always present in the map, so the return value is
 * always a known source string.
 */
export function resolveSkillUnlockSource(
  tree: SkillTreeKind,
  skillKey: string,
  branch: string,
): string {
  const normalizedSkill = normalizeKey(skillKey);
  const normalizedBranch = normalizeKey(branch);
  const candidates = [
    `${tree}_skill_unlock_${normalizedSkill}`,
    `${tree}_skill_branch_${normalizedBranch}`,
    `${tree}_skill_tree`,
  ];
  for (const candidate of candidates) {
    if (candidate in DEFAULT_FEEDBACK_SOURCE_TO_AVATAR) return candidate;
  }
  return `${tree}_skill_tree`;
}

/**
 * Companion orb variant for a skill node — same resolution as post-unlock feedback nudges.
 */
export function resolveFeedbackAvatarKeyForSkillNode(
  tree: SkillTreeKind,
  skillKey: string,
  branch: string,
): FeedbackAvatarKey {
  const source = resolveSkillUnlockSource(tree, skillKey, branch);
  return getAvatarForSource(source);
}
