import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { coinTransactions, organizationAptitudeEvents, securityEvents } from "@shared/schema";
import { db } from "./db";
import { addCoins, appendSecurityEvent, awardBadge } from "./storage";
import { tryCappedCoinAward, ENGAGEMENT } from "./engagement-rewards";
import { sourceToAptitudeArchetype } from "./lib/organization-aptitude-map";

const FILTER_SIGNAL_WINDOW_MS = 5 * 60 * 1000;
const ORG_BADGE_THRESHOLDS: Record<number, string> = {
  1: "organizational-aptitude-1",
  10: "organizational-aptitude-10",
  50: "organizational-aptitude-50",
};

type FilterSignalSource =
  | "header_sort_date"
  | "header_sort_updated"
  | "header_sort_created"
  | "header_sort_priority"
  | "header_sort_activity"
  | "header_sort_classification"
  | "header_sort_priority_score"
  | "header_sort_status"
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

export interface OrganizationInteractionRewardResult {
  awarded: boolean;
  pointsAwarded: number;
  coinsAwarded: number;
  archetypeKey: string;
  nodeweaverLabel: string;
  reason?: string;
}

interface OrganizationAptitudeTrends {
  totals: {
    samples: number;
    points: number;
    coins: number;
  };
  byArchetype: Array<{
    archetypeKey: string;
    samples: number;
    points: number;
    coins: number;
  }>;
  bySource: Array<{
    source: string;
    samples: number;
    points: number;
    coins: number;
  }>;
}

const HEADER_SIGNAL_DEDUPE_WINDOW_MS = 30 * 1000;
const HEADER_POINTS_PER_EVENT = 2;
const HEADER_POINTS_DAILY_CAP = 40;

function classifyNodeweaverUseCase(source: FilterSignalSource): string {
  if (source === "search") return "organizational.discovery_filter_followthrough";
  if (source.startsWith("header_sort_")) return "organizational.header_sort_signal";
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

async function countAptitudePointsEventsToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(organizationAptitudeEvents)
    .where(and(
      eq(organizationAptitudeEvents.userId, userId),
      sql`${organizationAptitudeEvents.createdAt}::date = timezone('UTC', now())::date`,
      sql`${organizationAptitudeEvents.pointsAwarded} > 0`,
    ));
  return Number(row?.value) || 0;
}

async function hasRecentHeaderSignal(userId: string, source: FilterSignalSource): Promise<boolean> {
  const since = new Date(Date.now() - HEADER_SIGNAL_DEDUPE_WINDOW_MS);
  const [row] = await db
    .select({ value: count() })
    .from(organizationAptitudeEvents)
    .where(and(
      eq(organizationAptitudeEvents.userId, userId),
      eq(organizationAptitudeEvents.source, source),
      gte(organizationAptitudeEvents.createdAt, since),
    ));
  return (Number(row?.value) || 0) > 0;
}

export async function awardOrganizationInteractionSignal(input: {
  userId: string;
  source: FilterSignalSource;
}): Promise<OrganizationInteractionRewardResult> {
  const deduped = await hasRecentHeaderSignal(input.userId, input.source);
  const archetypeKey = sourceToAptitudeArchetype(input.source);
  const nodeweaverLabel = classifyNodeweaverUseCase(input.source);
  const pointsEventsToday = await countAptitudePointsEventsToday(input.userId);
  const pointsAllowed = !deduped && pointsEventsToday < HEADER_POINTS_DAILY_CAP;
  const pointsAwarded = pointsAllowed ? HEADER_POINTS_PER_EVENT : 0;
  const coinAward = !deduped
    ? await tryCappedCoinAward({
      userId: input.userId,
      reason: ENGAGEMENT.headerInteraction.reason,
      amount: ENGAGEMENT.headerInteraction.amount,
      dailyCap: ENGAGEMENT.headerInteraction.dailyCap,
      details: `Header interaction (${input.source}; ${nodeweaverLabel})`,
    })
    : null;
  const coinsAwarded = coinAward?.coins ?? 0;
  await db.insert(organizationAptitudeEvents).values({
    userId: input.userId,
    source: input.source,
    archetypeKey,
    pointsAwarded,
    coinsAwarded,
    metadataJson: JSON.stringify({
      nodeweaverLabel,
      deduped,
      classifier: "nodeweaver_similarity_v1",
    }),
  });
  return {
    awarded: pointsAwarded > 0 || coinsAwarded > 0,
    pointsAwarded,
    coinsAwarded,
    archetypeKey,
    nodeweaverLabel,
    reason: deduped ? "deduped" : undefined,
  };
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

export async function getOrganizationAptitudeTrends(hours = 24 * 14): Promise<OrganizationAptitudeTrends> {
  const safeHours = Math.min(Math.max(1, Number(hours) || 24 * 14), 24 * 60);
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);
  const totalRows = await db
    .select({
      samples: count(),
      points: sql<number>`coalesce(sum(${organizationAptitudeEvents.pointsAwarded}), 0)`,
      coins: sql<number>`coalesce(sum(${organizationAptitudeEvents.coinsAwarded}), 0)`,
    })
    .from(organizationAptitudeEvents)
    .where(gte(organizationAptitudeEvents.createdAt, since));
  const byArchetypeRows = await db
    .select({
      archetypeKey: organizationAptitudeEvents.archetypeKey,
      samples: count(),
      points: sql<number>`coalesce(sum(${organizationAptitudeEvents.pointsAwarded}), 0)`,
      coins: sql<number>`coalesce(sum(${organizationAptitudeEvents.coinsAwarded}), 0)`,
    })
    .from(organizationAptitudeEvents)
    .where(gte(organizationAptitudeEvents.createdAt, since))
    .groupBy(organizationAptitudeEvents.archetypeKey)
    .orderBy(sql`coalesce(sum(${organizationAptitudeEvents.pointsAwarded}), 0) desc`);
  const bySourceRows = await db
    .select({
      source: organizationAptitudeEvents.source,
      samples: count(),
      points: sql<number>`coalesce(sum(${organizationAptitudeEvents.pointsAwarded}), 0)`,
      coins: sql<number>`coalesce(sum(${organizationAptitudeEvents.coinsAwarded}), 0)`,
    })
    .from(organizationAptitudeEvents)
    .where(gte(organizationAptitudeEvents.createdAt, since))
    .groupBy(organizationAptitudeEvents.source)
    .orderBy(sql`coalesce(sum(${organizationAptitudeEvents.pointsAwarded}), 0) desc`);

  const totals = totalRows[0] ?? { samples: 0, points: 0, coins: 0 };
  return {
    totals: {
      samples: Number(totals.samples) || 0,
      points: Number(totals.points) || 0,
      coins: Number(totals.coins) || 0,
    },
    byArchetype: byArchetypeRows.map((row) => ({
      archetypeKey: row.archetypeKey,
      samples: Number(row.samples) || 0,
      points: Number(row.points) || 0,
      coins: Number(row.coins) || 0,
    })),
    bySource: bySourceRows.map((row) => ({
      source: row.source,
      samples: Number(row.samples) || 0,
      points: Number(row.points) || 0,
      coins: Number(row.coins) || 0,
    })),
  };
}

