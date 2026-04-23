import { and, count, desc, eq, gte } from "drizzle-orm";
import { coinTransactions, securityEvents } from "@shared/schema";
import { db } from "./db";
import { addCoins, appendSecurityEvent, awardBadge } from "./storage";
import { tryCappedCoinAward, ENGAGEMENT } from "./engagement-rewards";

const FILTER_SIGNAL_WINDOW_MS = 5 * 60 * 1000;
const ORG_BADGE_THRESHOLDS: Record<number, string> = {
  1: "organizational-aptitude-1",
  10: "organizational-aptitude-10",
  50: "organizational-aptitude-50",
};

type FilterSignalSource =
  | "header_priority"
  | "header_status"
  | "header_classification"
  | "top_priority"
  | "top_status"
  | "route_chip"
  | "search";

interface RecordFilterIntentInput {
  userId: string;
  source: FilterSignalSource;
  value?: string;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface OrganizationFollowthroughResult {
  awarded: boolean;
  reason?: string;
  coinsAwarded: number;
  pointsAwarded: number;
  walletBalance?: number;
  badgesEarned: string[];
  nodeweaverLabel: string;
}

function classifyNodeweaverUseCase(source: FilterSignalSource): string {
  if (source === "search") return "organizational.discovery_filter_followthrough";
  if (source.startsWith("header_")) return "organizational.header_filter_followthrough";
  if (source.startsWith("top_")) return "organizational.quick_filter_followthrough";
  return "organizational.route_filter_followthrough";
}

export async function recordTaskFilterIntent(input: RecordFilterIntentInput): Promise<void> {
  const nodeweaverLabel = classifyNodeweaverUseCase(input.source);
  await appendSecurityEvent({
    eventType: "task_filter_intent",
    actorUserId: input.userId,
    route: input.route,
    method: "POST",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    payload: {
      source: input.source,
      value: input.value ? input.value.slice(0, 120) : null,
      nodeweaverLabel,
      classifier: "nodeweaver_similarity_v1",
    },
  });
}

async function countOrganizationAptitudeEvents(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, ENGAGEMENT.organizationAptitudePoints.reason)));
  return Number(row?.value) || 0;
}

async function hasFollowthroughAwardForTask(userId: string, taskId: string): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(
      eq(coinTransactions.userId, userId),
      eq(coinTransactions.reason, ENGAGEMENT.organizationFilterFollowthrough.reason),
      eq(coinTransactions.taskId, taskId),
    ));
  return (Number(row?.value) || 0) > 0;
}

async function resolveLatestFilterIntent(userId: string): Promise<{ source: FilterSignalSource } | null> {
  const since = new Date(Date.now() - FILTER_SIGNAL_WINDOW_MS);
  const rows = await db
    .select({
      payloadJson: securityEvents.payloadJson,
      createdAt: securityEvents.createdAt,
    })
    .from(securityEvents)
    .where(and(
      eq(securityEvents.actorUserId, userId),
      eq(securityEvents.eventType, "task_filter_intent"),
      gte(securityEvents.createdAt, since),
    ))
    .orderBy(desc(securityEvents.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  try {
    const parsed = row.payloadJson ? JSON.parse(row.payloadJson) as { source?: FilterSignalSource } : {};
    if (!parsed.source) return null;
    return { source: parsed.source };
  } catch {
    return null;
  }
}

export async function maybeAwardOrganizationFollowthrough(input: {
  userId: string;
  taskId: string;
}): Promise<OrganizationFollowthroughResult> {
  const alreadyAwarded = await hasFollowthroughAwardForTask(input.userId, input.taskId);
  if (alreadyAwarded) {
    return {
      awarded: false,
      reason: "already_awarded_for_task",
      coinsAwarded: 0,
      pointsAwarded: 0,
      badgesEarned: [],
      nodeweaverLabel: "organizational.header_filter_followthrough",
    };
  }

  const latestIntent = await resolveLatestFilterIntent(input.userId);
  if (!latestIntent) {
    return {
      awarded: false,
      reason: "missing_recent_filter_intent",
      coinsAwarded: 0,
      pointsAwarded: 0,
      badgesEarned: [],
      nodeweaverLabel: "organizational.header_filter_followthrough",
    };
  }

  const nodeweaverLabel = classifyNodeweaverUseCase(latestIntent.source);
  const coinAward = await tryCappedCoinAward({
    userId: input.userId,
    reason: ENGAGEMENT.organizationFilterFollowthrough.reason,
    amount: ENGAGEMENT.organizationFilterFollowthrough.amount,
    dailyCap: ENGAGEMENT.organizationFilterFollowthrough.dailyCap,
    taskId: input.taskId,
    details: `Filter follow-through (${latestIntent.source})`,
  });

  await addCoins(
    input.userId,
    0,
    ENGAGEMENT.organizationAptitudePoints.reason,
    `+${ENGAGEMENT.organizationAptitudePoints.pointsPerEvent} points (${latestIntent.source}; ${nodeweaverLabel})`,
    input.taskId,
  );

  const pointsEvents = await countOrganizationAptitudeEvents(input.userId);
  const badgesEarned: string[] = [];
  for (const [thresholdStr, badgeId] of Object.entries(ORG_BADGE_THRESHOLDS)) {
    const threshold = Number(thresholdStr);
    if (pointsEvents >= threshold) {
      const granted = await awardBadge(input.userId, badgeId);
      if (granted) {
        badgesEarned.push(badgeId);
        await addCoins(input.userId, 10, "badge_earned", `Badge: ${badgeId}`);
      }
    }
  }

  return {
    awarded: true,
    coinsAwarded: coinAward?.coins ?? 0,
    pointsAwarded: ENGAGEMENT.organizationAptitudePoints.pointsPerEvent,
    walletBalance: coinAward?.newBalance,
    badgesEarned,
    nodeweaverLabel,
  };
}

