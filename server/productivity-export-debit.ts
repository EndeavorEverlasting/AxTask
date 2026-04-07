import type { Response } from "express";
import { getOrCreateWallet, spendCoins } from "./storage";
import { productivityExportsFreeInDev } from "./productivity-export-pricing";

export function sendInsufficientCoins(res: Response, required: number, balance: number): void {
  res.status(402).json({
    code: "INSUFFICIENT_COINS",
    required,
    balance,
    message: `Need ${required} AxCoins (you have ${balance}).`,
  });
}

/**
 * Debits coins for a productivity export unless dev free mode or cost is 0.
 * Returns false if insufficient balance (response already sent).
 */
export async function debitProductivityExport(
  res: Response,
  userId: string,
  cost: number,
  reason: string,
  options?: { taskId?: string },
): Promise<boolean> {
  if (productivityExportsFreeInDev() || cost === 0) {
    return true;
  }
  const wallet = await spendCoins(userId, cost, reason, options);
  if (!wallet) {
    const w = await getOrCreateWallet(userId);
    sendInsufficientCoins(res, cost, w.balance);
    return false;
  }
  return true;
}
