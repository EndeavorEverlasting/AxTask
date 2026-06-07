import { getProviderMtdSummary, isProviderDataStale } from "./provider-usage-service";

export type UsageBudgetStatus = {
  monthlyBudgetCents: number;
  warnPercent: number;
  criticalPercent: number;
  mtdSpendCents: number;
  projectedMonthEndCents: number;
  percentOfBudget: number;
  level: "ok" | "warning" | "critical" | "unconfigured";
  warnings: string[];
};

function readBudgetEnv(): {
  monthlyBudgetCents: number;
  warnPercent: number;
  criticalPercent: number;
} {
  const monthlyBudgetCents = Number(process.env.AXTASK_MONTHLY_BUDGET_CENTS) || 0;
  const warnPercent = Number(process.env.AXTASK_BUDGET_WARN_PERCENT) || 80;
  const criticalPercent = Number(process.env.AXTASK_BUDGET_CRITICAL_PERCENT) || 100;
  return { monthlyBudgetCents, warnPercent, criticalPercent };
}

export async function getUsageBudgetStatus(): Promise<UsageBudgetStatus> {
  const { monthlyBudgetCents, warnPercent, criticalPercent } = readBudgetEnv();
  const provider = await getProviderMtdSummary("neon");
  const mtdSpendCents = provider.totalCostCents;

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projectedMonthEndCents =
    dayOfMonth > 0 && mtdSpendCents > 0
      ? Math.round((mtdSpendCents / dayOfMonth) * daysInMonth)
      : mtdSpendCents;

  const warnings: string[] = [];
  if (isProviderDataStale(provider.lastImportAt)) {
    warnings.push("Provider billing data is stale or missing — import Neon usage from the Usage tab.");
  }
  if (provider.dataQuality === "internal_estimate") {
    warnings.push("Spend figures are estimated until a Neon billing import is recorded.");
  }

  if (monthlyBudgetCents <= 0) {
    return {
      monthlyBudgetCents: 0,
      warnPercent,
      criticalPercent,
      mtdSpendCents,
      projectedMonthEndCents,
      percentOfBudget: 0,
      level: "unconfigured",
      warnings,
    };
  }

  const percentOfBudget = Math.round((mtdSpendCents / monthlyBudgetCents) * 100);
  const projectedPercent = Math.round((projectedMonthEndCents / monthlyBudgetCents) * 100);

  let level: UsageBudgetStatus["level"] = "ok";
  if (percentOfBudget >= criticalPercent || projectedPercent >= criticalPercent) {
    level = "critical";
    warnings.push(`MTD spend is at ${percentOfBudget}% of monthly budget.`);
  } else if (percentOfBudget >= warnPercent || projectedPercent >= warnPercent) {
    level = "warning";
    warnings.push(`MTD spend is at ${percentOfBudget}% of monthly budget (projected ${projectedPercent}%).`);
  }

  if (projectedPercent > 100 && level !== "critical") {
    warnings.push(`Projected month-end spend (${projectedPercent}% of budget) may exceed budget.`);
  }

  return {
    monthlyBudgetCents,
    warnPercent,
    criticalPercent,
    mtdSpendCents,
    projectedMonthEndCents,
    percentOfBudget,
    level,
    warnings,
  };
}
