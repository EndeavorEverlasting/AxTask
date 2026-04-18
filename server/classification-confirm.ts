import { randomUUID } from "crypto";
import { eq, and, sql, count, asc, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  coinTransactions,
  users,
  taskClassificationConfirmations,
  type Task,
} from "@shared/schema";
import { addCoins, getOrCreateWallet } from "./storage";

export type ClassificationContribution = {
  id: string;
  userId: string;
  displayName: string | null;
  classification: string;
  confirmationCount: number;
  totalCoinsEarned: number;
  baseCoinsAwarded: number;
};

const CONFIRMER_COINS = 5;
const CONTRIBUTOR_RATE = 0.08;

async function countTaskConfirmations(taskId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(taskClassificationConfirmations)
    .where(eq(taskClassificationConfirmations.taskId, taskId));
  return Number(row?.value) || 0;
}

export async function getClassificationConfirmPayload(
  userId: string,
  task: Task,
): Promise<{
  contributions: ClassificationContribution[];
  hasConfirmed: boolean;
  isContributor: boolean;
}> {
  const taskId = task.id;

  const [contribRow] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(
      and(
        eq(coinTransactions.taskId, taskId),
        eq(coinTransactions.userId, userId),
        eq(coinTransactions.reason, "task_classification"),
      ),
    );
  const isContributor = (Number(contribRow?.value) || 0) > 0;

  const [confRow] = await db
    .select({ value: count() })
    .from(taskClassificationConfirmations)
    .where(
      and(eq(taskClassificationConfirmations.taskId, taskId), eq(taskClassificationConfirmations.userId, userId)),
    );
  const hasConfirmed = (Number(confRow?.value) || 0) > 0;

  const classifierRows = await db
    .select({
      userId: coinTransactions.userId,
      totalCoins: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int`.as("totalCoins"),
    })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.taskId, taskId), eq(coinTransactions.reason, "task_classification")))
    .groupBy(coinTransactions.userId);

  const totalConfirmations = await countTaskConfirmations(taskId);

  let contributions: ClassificationContribution[] = [];

  if (classifierRows.length > 0) {
    const classifierIds = classifierRows.map((r) => r.userId);
    const displayNames =
      classifierIds.length > 0
        ? await db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, classifierIds))
        : [];
    const nameById = new Map(displayNames.map((u) => [u.id, u.displayName]));

    for (const row of classifierRows) {
      const [firstAmt] = await db
        .select({ amount: coinTransactions.amount })
        .from(coinTransactions)
        .where(
          and(
            eq(coinTransactions.taskId, taskId),
            eq(coinTransactions.userId, row.userId),
            eq(coinTransactions.reason, "task_classification"),
          ),
        )
        .orderBy(asc(coinTransactions.createdAt))
        .limit(1);
      const baseCoinsAwarded = Math.abs(Number(firstAmt?.amount) || 0);
      contributions.push({
        id: `tx:${taskId}:${row.userId}`,
        userId: row.userId,
        displayName: nameById.get(row.userId) ?? null,
        classification: task.classification,
        confirmationCount: 0,
        totalCoinsEarned: Number(row.totalCoins) || 0,
        baseCoinsAwarded,
      });
    }
    contributions.sort((a, b) => b.totalCoinsEarned - a.totalCoinsEarned);
    if (contributions[0]) {
      contributions[0] = { ...contributions[0], confirmationCount: totalConfirmations };
    }
  } else {
    contributions = [
      {
        id: `auto:${taskId}`,
        userId: task.userId || userId,
        displayName: "Auto",
        classification: task.classification,
        confirmationCount: totalConfirmations,
        totalCoinsEarned: 0,
        baseCoinsAwarded: 0,
      },
    ];
  }

  return { contributions, hasConfirmed, isContributor };
}

export async function confirmTaskClassificationForUser(
  userId: string,
  task: Task,
): Promise<{
  confirmerCoins: number;
  contributorBonuses: Array<{ displayName: string; bonus: number }>;
  newBalance: number;
}> {
  const payload = await getClassificationConfirmPayload(userId, task);
  if (payload.hasConfirmed) {
    throw new Error("Already confirmed");
  }
  if (payload.isContributor) {
    throw new Error("Contributor cannot confirm own classification reward");
  }
  if (payload.contributions.length === 0) {
    throw new Error("No classification to confirm");
  }

  await db.insert(taskClassificationConfirmations).values({
    id: randomUUID(),
    taskId: task.id,
    userId,
  });

  await addCoins(
    userId,
    CONFIRMER_COINS,
    "classification_confirmer",
    `Confirmed classification for task`,
    task.id,
  );

  const contributorBonuses: Array<{ displayName: string; bonus: number }> = [];

  for (const c of payload.contributions) {
    if (c.baseCoinsAwarded <= 0) continue;
    const bonus = Math.max(1, Math.round(c.baseCoinsAwarded * CONTRIBUTOR_RATE));
    await addCoins(
      c.userId,
      bonus,
      "classification_confirmation_received",
      `Classification confirmation bonus (task ${task.id.slice(0, 8)}…)`,
      task.id,
    );
    contributorBonuses.push({
      displayName: c.displayName || "Classifier",
      bonus,
    });
  }

  const wallet = await getOrCreateWallet(userId);

  return { confirmerCoins: CONFIRMER_COINS, contributorBonuses, newBalance: wallet.balance };
}
