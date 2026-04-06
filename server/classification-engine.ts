import { type Task } from "@shared/schema";
import { builtInCoinReward, isGeneralClassification } from "@shared/classification-catalog";
import {
  addCoins,
  getOrCreateWallet,
  createClassificationContribution,
  getCustomClassificationCoinReward,
  awardCoinsForConfirmationAtomic,
} from "./storage";
import { getMaxCompoundPeriods } from "./lib/classification-compound";

async function resolveBaseCoinsForClassification(userId: string, classification: string): Promise<number> {
  const builtin = builtInCoinReward(classification);
  if (builtin !== undefined) return builtin;
  const custom = await getCustomClassificationCoinReward(userId, classification);
  if (custom !== null) return custom;
  return 5;
}

const COMPOUND_RATE = 0.08;

export interface ClassificationAwardResult {
  coinsEarned: number;
  newBalance: number;
  classification: string;
}

export interface ConfirmationAwardResult {
  confirmerCoins: number;
  contributorBonuses: { userId: string; displayName: string | null; bonus: number }[];
  totalConfirmations: number;
  newBalance: number;
}

export async function awardCoinsForClassification(
  userId: string,
  task: Task
): Promise<ClassificationAwardResult | null> {
  if (!task.classification || isGeneralClassification(task.classification)) return null;

  await getOrCreateWallet(userId);

  const base = await resolveBaseCoinsForClassification(userId, task.classification);

  const { created } = await createClassificationContribution(task.id, userId, task.classification, base);
  if (!created) return null;

  const { wallet } = await addCoins(
    userId,
    base,
    "classification",
    `Classified "${task.activity.substring(0, 80)}" as ${task.classification}`,
    task.id
  );

  return {
    coinsEarned: base,
    newBalance: wallet.balance,
    classification: task.classification,
  };
}

export async function awardCoinsForConfirmation(
  confirmingUserId: string,
  taskId: string
): Promise<ConfirmationAwardResult | null> {
  return awardCoinsForConfirmationAtomic(confirmingUserId, taskId);
}

export function getCompoundProjection(baseCoins: number, confirmations: number): number[] {
  const projections: number[] = [];
  const MAX_COMPOUND_PERIODS = getMaxCompoundPeriods();
  for (let i = 0; i <= Math.min(confirmations, MAX_COMPOUND_PERIODS); i++) {
    projections.push(Math.round(baseCoins * Math.pow(1 + COMPOUND_RATE, i)));
  }
  return projections;
}
