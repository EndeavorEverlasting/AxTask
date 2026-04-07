/**
 * Playstyle → cohort assignment from observable “gameplay” (how people use AxTask).
 *
 * Rollups are anonymous counts + mean signal vectors for ops / capacity / inevitability modeling.
 * Individual assignments exist only to recompute rollups efficiently; do not expose in product APIs.
 */
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import {
  avatarXpEvents,
  coinTransactions,
  playstyleCohortRollups,
  userPlaystyleAssignments,
} from "@shared/schema";
import { getUserClassificationStats } from "../../storage";
import {
  assignPlaystyleCohort,
  COHORT_KEYS,
  meanPlaystyleSignals,
  PLAYSTYLE_ASSIGNMENT_VERSION,
  type PlaystyleSignals,
} from "./playstyle-cohort-rules";

export {
  assignPlaystyleCohort,
  COHORT_KEYS,
  PLAYSTYLE_ASSIGNMENT_VERSION,
  type PlaystyleCohortKey,
  type PlaystyleSignals,
} from "./playstyle-cohort-rules";

function clamp01(x: number): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export async function computePlaystyleSignals(
  userId: string,
  windowDays: number,
): Promise<PlaystyleSignals> {
  const days = Math.max(7, Math.min(90, windowDays));
  const since = new Date(Date.now() - days * 86400000);

  const events = await db
    .select()
    .from(avatarXpEvents)
    .where(and(eq(avatarXpEvents.userId, userId), gte(avatarXpEvents.createdAt, since)));

  let task = 0;
  let feedback = 0;
  let post = 0;
  const byAvatar: Record<string, number> = {};

  for (const e of events) {
    if (e.sourceType === "task") task += 1;
    else if (e.sourceType === "feedback") feedback += 1;
    else if (e.sourceType === "post") post += 1;
    byAvatar[e.avatarKey] = (byAvatar[e.avatarKey] || 0) + 1;
  }

  const n = events.length;
  const social = feedback + post;
  const taskRatio = n ? task / n : 0;
  const socialRatio = n ? social / n : 0;
  const postRatio = n ? post / n : 0;

  const productivityShare = n ? (byAvatar.productivity || 0) / n : 0;
  const archetypeShare = n ? (byAvatar.archetype || 0) / n : 0;
  const moodShare = n ? (byAvatar.mood || 0) / n : 0;
  const socialAvatarShare = n ? (byAvatar.social || 0) / n : 0;

  const maxAvatarConcentration = n ? Math.max(...Object.values(byAvatar), 0) / n : 0;

  const [coinRow] = await db
    .select({ n: count() })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), gte(coinTransactions.createdAt, since)));
  const coinEvents = Number(coinRow?.n) || 0;

  const classStats = await getUserClassificationStats(userId);
  const classificationScore = clamp01(Math.log1p(classStats.totalClassifications) / Math.log1p(80));

  return {
    events: n,
    taskRatio: clamp01(taskRatio),
    socialRatio: clamp01(socialRatio),
    postRatio: clamp01(postRatio),
    productivityShare: clamp01(productivityShare),
    archetypeShare: clamp01(archetypeShare),
    moodShare: clamp01(moodShare),
    socialAvatarShare: clamp01(socialAvatarShare),
    classificationScore,
    coinEvents,
    maxAvatarConcentration: clamp01(maxAvatarConcentration),
  };
}

export type PlaystyleRecomputeResult = {
  assignmentVersion: string;
  windowDays: number;
  usersScanned: number;
  cohorts: Array<{ cohortKey: string; memberCount: number; signalsMean: Record<string, number> }>;
  computedAt: string;
};

export async function recomputePlaystyleCohortRollups(): Promise<PlaystyleRecomputeResult> {
  const windowDays = Math.max(
    7,
    Math.min(90, Number.parseInt(process.env.PLAYSTYLE_WINDOW_DAYS || "28", 10) || 28),
  );
  const userCap = Math.max(
    100,
    Math.min(50_000, Number.parseInt(process.env.PLAYSTYLE_COHORT_USER_CAP || "8000", 10) || 8000),
  );
  const since = new Date(Date.now() - windowDays * 86400000);

  const distinctUsers = await db
    .selectDistinct({ userId: avatarXpEvents.userId })
    .from(avatarXpEvents)
    .where(gte(avatarXpEvents.createdAt, since))
    .limit(userCap);

  const byCohort: Record<string, PlaystyleSignals[]> = {};
  const version = PLAYSTYLE_ASSIGNMENT_VERSION;
  const now = new Date();

  let scanned = 0;
  for (const row of distinctUsers) {
    const userId = row.userId;
    const signals = await computePlaystyleSignals(userId, windowDays);
    const cohort = assignPlaystyleCohort(signals);
    scanned += 1;

    await db
      .insert(userPlaystyleAssignments)
      .values({
        userId,
        cohortKey: cohort,
        signalsJson: JSON.stringify(signals),
        assignmentVersion: version,
        computedAt: now,
      })
      .onConflictDoUpdate({
        target: userPlaystyleAssignments.userId,
        set: {
          cohortKey: cohort,
          signalsJson: JSON.stringify(signals),
          assignmentVersion: version,
          computedAt: now,
        },
      });

    if (!byCohort[cohort]) byCohort[cohort] = [];
    byCohort[cohort].push(signals);
  }

  await db.delete(playstyleCohortRollups).where(eq(playstyleCohortRollups.assignmentVersion, version));

  const cohortSummaries: PlaystyleRecomputeResult["cohorts"] = [];
  for (const cohortKey of COHORT_KEYS) {
    const members = byCohort[cohortKey] || [];
    if (members.length === 0) continue;
    const signalsMean = meanPlaystyleSignals(members);
    await db.insert(playstyleCohortRollups).values({
      cohortKey,
      memberCount: members.length,
      signalsMeanJson: JSON.stringify(signalsMean),
      assignmentVersion: version,
      computedAt: now,
    });
    cohortSummaries.push({
      cohortKey,
      memberCount: members.length,
      signalsMean,
    });
  }

  cohortSummaries.sort((a, b) => b.memberCount - a.memberCount);

  return {
    assignmentVersion: version,
    windowDays,
    usersScanned: scanned,
    cohorts: cohortSummaries,
    computedAt: now.toISOString(),
  };
}

export async function getLatestPlaystyleCohortRollups(): Promise<{
  assignmentVersion: string;
  computedAt: string | null;
  cohorts: Array<{
    cohortKey: string;
    memberCount: number;
    signalsMean: Record<string, number>;
  }>;
}> {
  const version = PLAYSTYLE_ASSIGNMENT_VERSION;
  const rows = await db
    .select()
    .from(playstyleCohortRollups)
    .where(eq(playstyleCohortRollups.assignmentVersion, version))
    .orderBy(desc(playstyleCohortRollups.computedAt));

  if (rows.length === 0) {
    return { assignmentVersion: version, computedAt: null, cohorts: [] };
  }

  const computedAt = rows[0].computedAt?.toISOString() ?? null;
  const cohorts = rows.map((r) => ({
    cohortKey: r.cohortKey,
    memberCount: r.memberCount,
    signalsMean: JSON.parse(r.signalsMeanJson || "{}") as Record<string, number>,
  }));

  return { assignmentVersion: version, computedAt, cohorts };
}
