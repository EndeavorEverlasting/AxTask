import { getAvatarForSource, isFeedbackAvatarKey, type FeedbackAvatarKey } from "@shared/feedback-avatar-map";

export type FeedbackNudgeLike = {
  avatarKey?: string | null;
  source?: string | null;
};

/**
 * Picks which companion receives avatar-mission credit for a feedback submission.
 */
export function resolveAvatarKeyForFeedbackMission(nudge: FeedbackNudgeLike | null | undefined): FeedbackAvatarKey {
  const raw = nudge?.avatarKey;
  if (raw && isFeedbackAvatarKey(raw)) return raw;
  return getAvatarForSource(nudge?.source ?? undefined);
}
