import { appendSecurityEvent } from "../storage";
import { hashActor } from "./actor-hash";
import {
  AVATAR_TO_ARCHETYPE,
  type ArchetypeKey,
  isArchetypeKey,
} from "@shared/avatar-archetypes";
import { isFeedbackAvatarKey, type FeedbackAvatarKey } from "@shared/feedback-avatar-map";
import { ARCHETYPE_SIGNAL_PAYLOAD_VERSION } from "./archetype-signal-payload";
import { bumpUserArchetypeContinuumFromSignal } from "./archetype-continuum";

export type ArchetypeSignalKind =
  | "nudge_shown"
  | "nudge_dismissed"
  | "nudge_opened"
  | "feedback_submitted";

export type ArchetypeSignalInsightful = "up" | "down" | null;

export interface RecordArchetypeSignalInput {
  userId: string;
  signal: ArchetypeSignalKind;
  avatarKey: FeedbackAvatarKey | string | null | undefined;
  source?: string | null;
  insightful?: ArchetypeSignalInsightful;
  sentiment?: "positive" | "neutral" | "negative" | null;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Writes an `archetype_signal` row to the tamper-evident security_events
 * ledger. Deliberately does NOT persist `actorUserId` on the row itself — the
 * hashed actor goes into the JSON payload instead, so per-user analysis is
 * structurally impossible from this stream.
 *
 * Returns `null` when the avatarKey can't be resolved to an archetype (unknown
 * or null), rather than throwing — feedback submission must not fail because
 * analytics couldn't classify the nudge.
 */
export async function recordArchetypeSignal(
  input: RecordArchetypeSignalInput,
): Promise<{ archetypeKey: ArchetypeKey; hashedActor: string } | null> {
  const archetypeKey = resolveArchetypeKey(input.avatarKey);
  if (!archetypeKey) return null;
  if (!input.userId) return null;

  const hashedActor = hashActor(input.userId);

  await appendSecurityEvent({
    eventType: "archetype_signal",
    // Intentionally omit actorUserId so the row cannot be linked back to a
    // specific user. hashedActor (non-reversible) lives in the payload only.
    route: input.route,
    method: "POST",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    payload: {
      v: ARCHETYPE_SIGNAL_PAYLOAD_VERSION,
      schemaVersion: ARCHETYPE_SIGNAL_PAYLOAD_VERSION,
      archetypeKey,
      hashedActor,
      signal: input.signal,
      insightful: input.insightful ?? null,
      sentiment: input.sentiment ?? null,
      sourceCategory: categorizeSource(input.source),
    },
  });

  await bumpUserArchetypeContinuumFromSignal(input.userId, archetypeKey, input.signal);

  return { archetypeKey, hashedActor };
}

function resolveArchetypeKey(
  avatarKey: FeedbackAvatarKey | string | null | undefined,
): ArchetypeKey | null {
  if (!avatarKey) return null;
  if (isFeedbackAvatarKey(avatarKey)) return AVATAR_TO_ARCHETYPE[avatarKey] ?? null;
  if (isArchetypeKey(avatarKey)) return avatarKey;
  return null;
}

/**
 * Reduce a free-form `source` string to a coarse, non-PII category so empathy
 * rollups can slice by context without ever storing the raw string.
 */
function categorizeSource(source: string | null | undefined): string {
  if (!source) return "unknown";
  const s = source.toLowerCase();
  if (s.includes("skill_unlock")) return "skill_unlock";
  if (s.includes("skill_branch")) return "skill_branch";
  if (s.includes("skill_tree")) return "skill_tree";
  if (s.startsWith("task_")) return "task";
  if (s.startsWith("classification_")) return "classification";
  if (s.startsWith("community_")) return "community";
  if (s.includes("coin") || s.includes("reward")) return "rewards";
  if (s.includes("bulk")) return "bulk";
  if (s.includes("dashboard")) return "dashboard";
  if (s.includes("recalculate")) return "recalibration";
  return "other";
}
