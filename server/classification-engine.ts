import { type Task } from "@shared/schema";
import { builtInCoinReward, isGeneralClassification } from "@shared/classification-catalog";
import {
  addCoins,
  getOrCreateWallet,
  createClassificationContribution,
  getContributionsForTask,
  getCustomClassificationCoinReward,
  hasUserConfirmedTask,
  recordConfirmation,
  updateContributionEarnings,
  incrementContributionConfirmCount,
} from "./storage";
import { computeCompoundContributorBonus, getMaxCompoundPeriods } from "./lib/classification-compound";

async function resolveBaseCoinsForClassification(userId: string, classification: string): Promise<number> {
  const builtin = builtInCoinReward(classification);
  if (builtin !== undefined) return builtin;
  const custom = await getCustomClassificationCoinReward(userId, classification);
  if (custom !== null) return custom;
  return 5;
}

const COMPOUND_RATE = 0.08;
const CONFIRMER_BASE_REWARD = 3;
const MAX_COMPOUND_PERIODS = getMaxCompoundPeriods();

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

  await createClassificationContribution(task.id, userId, task.classification, base);

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
  const alreadyConfirmed = await hasUserConfirmedTask(taskId, confirmingUserId);
  if (alreadyConfirmed) return null;

  const contributions = await getContributionsForTask(taskId);
  if (contributions.length === 0) return null;

  const isContributor = contributions.some(c => c.userId === confirmingUserId);
  if (isContributor) return null;

  await getOrCreateWallet(confirmingUserId);

  const primaryContribution = contributions[0];
  await recordConfirmation(primaryContribution.id, taskId, confirmingUserId, CONFIRMER_BASE_REWARD);

  const { wallet: confirmerWallet } = await addCoins(
    confirmingUserId,
    CONFIRMER_BASE_REWARD,
    "classification_confirm",
    `Confirmed classification on task`,
    taskId
  );

  const contributorBonuses: { userId: string; displayName: string | null; bonus: number }[] = [];

  for (const contrib of contributions) {
    const bonus = computeCompoundContributorBonus(contrib.baseCoinsAwarded, contrib.confirmationCount);
    const compoundPeriod = Math.min(contrib.confirmationCount + 1, getMaxCompoundPeriods());

    if (bonus > 0) {
      await incrementContributionConfirmCount(contrib.id);
      await updateContributionEarnings(contrib.id, bonus);
      await addCoins(
        contrib.userId,
        bonus,
        "classification_confirmed",
        `Your classification was confirmed (×${compoundPeriod}): +${bonus} compound interest`,
        taskId
      );

      contributorBonuses.push({
        userId: contrib.userId,
        displayName: contrib.displayName,
        bonus,
      });
    }
  }

  const updatedContributions = await getContributionsForTask(taskId);
  const totalConfirmations = updatedContributions.reduce((sum, c) => sum + c.confirmationCount, 0);

  return {
    confirmerCoins: CONFIRMER_BASE_REWARD,
    contributorBonuses,
    totalConfirmations,
    newBalance: confirmerWallet.balance,
  };
}

export function getCompoundProjection(baseCoins: number, confirmations: number): number[] {
  const projections: number[] = [];
  for (let i = 0; i <= Math.min(confirmations, MAX_COMPOUND_PERIODS); i++) {
    projections.push(Math.round(baseCoins * Math.pow(1 + COMPOUND_RATE, i)));
  }
  return projections;
}
